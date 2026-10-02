/**
 * Hive Auth (HAS) Module
 * Ported from uswapapp's monolithic main.js into its own module, following
 * the same promise-based / manager pattern as WalletManager, SwapManager, etc.
 *
 * Protocol reference: https://github.com/openhive-network/hive-auth-services
 * Flow: connect websocket -> auth_req -> (auth_wait -> show QR) -> auth_ack
 *       (decrypt + cache token) -> user clicks Approve -> sign_req -> sign_ack/nack/err
 */
const HiveAuthManager = (function() {
    let ws = null;
    let wsReady = false;
    let connecting = null; // in-flight connection promise
    let modal = null;

    const STORAGE_TOKEN = 'hiveAuthToken';
    const STORAGE_KEY = 'hiveAuthKey';
    const STORAGE_EXPIRE = 'hiveAuthExpire';

    /**
     * Is this browser capable of Hive Auth at all
     */
    function isSupported() {
        return "WebSocket" in window;
    }

    /**
     * Open (or reuse) the websocket connection to the HAS server
     */
    function connect() {
        if (!isSupported()) {
            return Promise.reject(new Utils.APIError('WebSocket is not supported in this browser'));
        }

        if (wsReady && ws && ws.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }

        if (connecting) {
            return connecting;
        }

        connecting = new Promise((resolve, reject) => {
            try {
                ws = new WebSocket(CONFIG.HIVE_AUTH_SERVER);
            } catch (error) {
                connecting = null;
                reject(new Utils.APIError('Unable to open Hive Auth connection'));
                return;
            }

            const connectTimeout = setTimeout(() => {
                connecting = null;
                reject(new Utils.APIError('Hive Auth connection timed out'));
            }, 8000);

            ws.onopen = () => {
                clearTimeout(connectTimeout);
                wsReady = true;
                connecting = null;
                console.log('✅ Hive Auth connected');
                resolve();
            };

            ws.onerror = (event) => {
                clearTimeout(connectTimeout);
                wsReady = false;
                connecting = null;
                console.error('❌ Hive Auth connection error', event);
                reject(new Utils.APIError('Hive Auth connection error'));
            };

            ws.onclose = () => {
                wsReady = false;
                console.log('Hive Auth connection closed');
            };
        });

        return connecting;
    }

    /**
     * Lazily create the bootstrap modal wrapper around the existing #authqr markup
     */
    function getModal() {
        if (!modal && window.bootstrap) {
            const el = document.getElementById('authqr');
            if (el) {
                modal = new bootstrap.Modal(el, { focus: true, backdrop: 'static' });
            }
        }
        return modal;
    }

    function showQRStep(uri) {
        const qrUrl = "https://api.qrserver.com/v1/create-qr-code/?size=1000x1000&data=" + encodeURIComponent(uri);
        const qrCode = document.getElementById('qr-code');
        const qrLink = document.getElementById('qr-link');
        const qrDiv = document.getElementById('qr-div');
        const approveDiv = document.getElementById('approve-div');

        if (qrCode) qrCode.setAttribute('src', qrUrl);
        if (qrLink) qrLink.setAttribute('href', uri);
        if (qrDiv) { qrDiv.classList.add('d-flex'); qrDiv.classList.remove('d-none'); }
        if (approveDiv) { approveDiv.classList.add('d-none'); approveDiv.classList.remove('d-flex'); }

        getModal()?.show();
    }

    function showApproveStep() {
        const qrDiv = document.getElementById('qr-div');
        const approveDiv = document.getElementById('approve-div');

        if (qrDiv) { qrDiv.classList.remove('d-flex'); qrDiv.classList.add('d-none'); }
        if (approveDiv) { approveDiv.classList.add('d-flex'); approveDiv.classList.remove('d-none'); }

        getModal()?.show();
    }

    function hideModal() {
        getModal()?.hide();
    }

    function isTimeAvailable(expire) {
        const timestamp = Date.now();
        return !!expire && parseInt(expire, 10) > timestamp;
    }

    function hasValidCachedToken() {
        return !!(
            localStorage.getItem(STORAGE_TOKEN) &&
            localStorage.getItem(STORAGE_KEY) &&
            isTimeAvailable(localStorage.getItem(STORAGE_EXPIRE))
        );
    }

    function buildSignOp(username, currency, amount, memo) {
        if (currency !== "HBD") {
            const json = JSON.stringify({
                contractName: "tokens",
                contractAction: "transfer",
                contractPayload: {
                    symbol: currency,
                    to: CONFIG.BRIDGE_USER,
                    quantity: amount,
                    memo: memo
                }
            });

            return ["custom_json", {
                id: "ssc-mainnet-hive",
                json: json,
                required_auths: [username],
                required_posting_auths: []
            }];
        }

        return ["transfer", {
            from: username,
            to: CONFIG.BRIDGE_USER,
            amount: `${amount} HBD`,
            memo: memo
        }];
    }

    /**
     * Request a signed transfer (HBD transfer or SWAP.HBD custom_json) via Hive Auth.
     * Resolves { success: true, transactionId } on sign_ack, rejects with a
     * Utils.TransactionError / Utils.APIError otherwise.
     */
    function requestTransfer(username, amount, currency, memo) {
        return new Promise(async (resolve, reject) => {
            let settled = false;
            let socket = null; // the socket this request runs on

            const onSocketClosed = () => {
                hideModal();
                finish(reject, new Utils.TransactionError(
                    'Lost connection to Hive Auth. If you already approved, check ' +
                    "'My Recent Swaps' before trying again."
                ));
            };

            const finish = (fn, arg) => {
                if (settled) return;
                settled = true;
                if (socket) {
                    socket.onmessage = null;
                    socket.removeEventListener('close', onSocketClosed);
                }
                const approveBtn = document.getElementById('approve');
                if (approveBtn) approveBtn.onclick = null;
                clearTimeout(safetyTimer);
                fn(arg);
            };

            const safetyTimer = setTimeout(() => {
                hideModal();
                finish(reject, new Utils.TransactionError('Hive Auth request timed out. Please try again.'));
            }, CONFIG.HIVE_AUTH_TIMEOUT);

            try {
                await connect();
            } catch (error) {
                finish(reject, error);
                return;
            }

            // Fail fast if the socket drops mid-flow, instead of leaving the
            // user waiting out the full HIVE_AUTH_TIMEOUT.
            socket = ws;
            socket.addEventListener('close', onSocketClosed);

            const reusingToken = hasValidCachedToken();
            let auth_key = reusingToken ? localStorage.getItem(STORAGE_KEY) : uuidv4();
            let token = reusingToken ? localStorage.getItem(STORAGE_TOKEN) : undefined;

            // ws.send() throws on a closed socket; report that as a failed
            // request instead of an uncaught error from the Approve click.
            const send = (payload) => {
                if (settled) return;
                if (socket.readyState !== WebSocket.OPEN) {
                    onSocketClosed();
                    return;
                }
                socket.send(payload);
            };

            const sendSignRequest = () => {
                const op = buildSignOp(username, currency, amount, memo);
                const sign_data = { key_type: "active", ops: [op], broadcast: true };
                const data = CryptoJS.AES.encrypt(JSON.stringify(sign_data), auth_key).toString();
                send(JSON.stringify({ cmd: "sign_req", account: username, token: token, data: data }));
            };

            socket.onmessage = function(event) {
                let message;
                try {
                    message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
                } catch (error) {
                    return; // ignore malformed frames
                }
                if (!message || !message.cmd) return;

                switch (message.cmd) {
                    case "auth_wait": {
                        const authPayload = JSON.stringify({
                            account: username,
                            uuid: message.uuid,
                            key: auth_key,
                            host: CONFIG.HIVE_AUTH_SERVER
                        });
                        showQRStep(`has://auth_req/${btoa(authPayload)}`);
                        UIManager.showLoading('Scan the QR code with your Hive Authentication App...');
                        break;
                    }

                    case "auth_ack": {
                        try {
                            const decrypted = JSON.parse(
                                CryptoJS.AES.decrypt(message.data, auth_key).toString(CryptoJS.enc.Utf8)
                            );
                            token = decrypted.token;
                            localStorage.setItem(STORAGE_TOKEN, token);
                            localStorage.setItem(STORAGE_EXPIRE, decrypted.expire);
                            localStorage.setItem(STORAGE_KEY, auth_key);

                            showApproveStep();
                            UIManager.showSuccess('Connected! Approve the transaction to continue.');

                            const approveBtn = document.getElementById('approve');
                            if (approveBtn) {
                                approveBtn.onclick = () => {
                                    hideModal();
                                    UIManager.showLoading('Waiting for approval from Hive Auth App...');
                                    sendSignRequest();
                                };
                            }
                        } catch (error) {
                            hideModal();
                            finish(reject, new Utils.TransactionError('Failed to establish a connection with Hive Auth. Please try again.'));
                        }
                        break;
                    }

                    case "auth_nack":
                        hideModal();
                        finish(reject, new Utils.TransactionError('Hive Auth request was declined.'));
                        break;

                    case "sign_wait":
                        UIManager.showLoading('Waiting for approval from Hive Auth App...');
                        break;

                    case "sign_ack": {
                        // Some HAS relays echo back the broadcast result under message.data;
                        // fall back to null (matching the Keychain path) if it isn't present.
                        const txId = Utils.extractTxId(message.data);
                        finish(resolve, { success: true, transactionId: txId });
                        break;
                    }

                    case "sign_nack":
                        finish(reject, new Utils.TransactionError('Transaction was declined through Hive Auth.'));
                        break;

                    case "sign_err":
                        finish(reject, new Utils.TransactionError('Transaction failed through Hive Auth.'));
                        break;
                }
            };

            // Kick off the flow: always start with auth_req (passing the cached token,
            // if any, lets the HAS server skip re-issuing a QR scan for a known device).
            const auth_data = { app: CONFIG.HIVE_AUTH_APP_DATA, token: token, challenge: undefined };
            const data = CryptoJS.AES.encrypt(JSON.stringify(auth_data), auth_key).toString();
            send(JSON.stringify({ cmd: "auth_req", account: username, data: data, token: token }));
        });
    }

    /**
     * Initialize: open the websocket eagerly so the first swap doesn't pay
     * the connection-latency cost. Safe to call even if unsupported.
     */
    function initialize() {
        if (!isSupported()) {
            console.warn('HiveAuthManager: WebSocket not supported, Hive Auth will be unavailable');
            return;
        }
        connect().catch((error) => {
            console.warn('HiveAuthManager: initial connection failed, will retry on first use', error.message);
        });
    }

    // Public API
    return {
        initialize,
        isSupported,
        requestTransfer
    };
})();
