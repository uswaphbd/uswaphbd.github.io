/**
 * Swap Module
 * Handles swap calculations, fee calculations, and swap execution with improved accuracy
 */

const SwapManager = (function() {
    // ---------------------------------------------------------------------
    // Settings resolution: hbd.json is the reference, config.js is the
    // fallback. A field is taken from hbd.json only when that endpoint
    // answers AND actually publishes a usable value for it. Otherwise the
    // config.js value applies.
    //
    // FALLBACK is captured once at load and frozen, and every fetch falls
    // back to THIS - never to whatever hbd.json last happened to serve.
    // fetchFeeConfig re-runs before every swap, so without a pristine
    // baseline a field the operator removes from hbd.json would stick at its
    // old live value instead of returning to the config.js default.
    // ---------------------------------------------------------------------
    const FALLBACK = Object.freeze({
        BASE_FEE: Utils.parseNumber(CONFIG.BASE_FEE, 0),
        MIN_BASE_FEE: Utils.parseNumber(CONFIG.MIN_BASE_FEE, 0),
        DIFF_COEFFICIENT: Utils.parseNumber(CONFIG.DIFF_COEFFICIENT, 0),
        BASE_PRICE_HBD_TO_SHBD: Utils.parseNumber(CONFIG.BASE_PRICE_HBD_TO_SHBD, 1),
        MINIMUM_LIQUIDITY: Utils.parseNumber(CONFIG.MINIMUM_LIQUIDITY, 0),
        IS_STOPPED: CONFIG.IS_STOPPED === true,
        BACKEND_VERSION: CONFIG.BACKEND_VERSION || null
    });

    /**
     * True when hbd.json said nothing usable about a field, so config.js wins.
     * Absent, null, or empty string all count as "not mentioned".
     */
    function notMentioned(value) {
        return value === undefined || value === null || value === "";
    }

    /**
     * A number published by hbd.json, else the config.js fallback.
     * Zero is a legitimate published value (e.g. a zero fee) and is kept;
     * only unparseable values fall through.
     */
    function pickNumber(published, fallback) {
        if (notMentioned(published)) return fallback;
        const n = parseFloat(published);
        return isFinite(n) ? n : fallback;
    }

    /**
     * Same, but for a field where zero or negative is meaningless and would
     * corrupt the maths - BASE_PRICE_HBD_TO_SHBD is inverted for the
     * SWAP.HBD -> HBD direction, so a published 0 would yield Infinity.
     */
    function pickPositiveNumber(published, fallback) {
        const n = pickNumber(published, fallback);
        return n > 0 ? n : fallback;
    }

    /**
     * A boolean published by hbd.json, else the config.js fallback. Accepts
     * the usual JSON spellings; anything unrecognisable is treated as not
     * mentioned so config.js decides rather than a garbled value.
     */
    function pickFlag(published, fallback) {
        if (notMentioned(published)) return fallback;
        if (published === true || published === false) return published;
        if (typeof published === "number") {
            if (published === 1) return true;
            if (published === 0) return false;
            return fallback;
        }
        if (typeof published === "string") {
            const s = published.trim().toLowerCase();
            if (s === "true" || s === "1" || s === "yes") return true;
            if (s === "false" || s === "0" || s === "no") return false;
        }
        return fallback;
    }

    let feeConfig = {
        BASE_FEE: FALLBACK.BASE_FEE,
        MIN_BASE_FEE: FALLBACK.MIN_BASE_FEE,
        DIFF_COEFFICIENT: FALLBACK.DIFF_COEFFICIENT,
        BASE_PRICE_HBD_TO_SHBD: FALLBACK.BASE_PRICE_HBD_TO_SHBD
    };

    // Backend script version - replaced when hbd.json publishes one.
    // backendVersionSource records WHICH source won, so the footer tooltip can
    // tell the truth instead of claiming every value came from the bridge.
    let backendVersion = FALLBACK.BACKEND_VERSION;
    let backendVersionSource = "config.js";

    // Operator controls, refreshed from hbd.json (see fetchFeeConfig).
    let bridgeStopped = FALLBACK.IS_STOPPED;
    let minimumLiquidity = FALLBACK.MINIMUM_LIQUIDITY;

    /**
     * Reset every hbd.json-backed setting to its config.js value. Used when
     * hbd.json is unreachable, so a stale value the endpoint served earlier
     * in the session cannot outlive it.
     */
    function applyFallbackConfig() {
        feeConfig.BASE_FEE = FALLBACK.BASE_FEE;
        feeConfig.MIN_BASE_FEE = FALLBACK.MIN_BASE_FEE;
        feeConfig.DIFF_COEFFICIENT = FALLBACK.DIFF_COEFFICIENT;
        feeConfig.BASE_PRICE_HBD_TO_SHBD = FALLBACK.BASE_PRICE_HBD_TO_SHBD;
        minimumLiquidity = FALLBACK.MINIMUM_LIQUIDITY;
        bridgeStopped = FALLBACK.IS_STOPPED;
        backendVersion = FALLBACK.BACKEND_VERSION;
        backendVersionSource = "config.js";
    }

    /**
     * Warn when a value hbd.json publishes disagrees with the config.js
     * fallback for the same setting.
     *
     * config.js is what the app falls back to if hbd.json is ever unreachable,
     * so drift between the two is invisible until an outage - at which point
     * the app would quote last year's numbers with no warning. This surfaces it
     * on every load instead. Diagnostic only: it changes nothing about a swap.
     *
     * IS_STOPPED is deliberately excluded. Pausing the bridge is done in
     * hbd.json while config.js stays false, so a difference there is the
     * intended arrangement rather than drift.
     */
    function warnOnConfigDrift(data) {
        const drift = [];

        function compare(key, rawValue, resolvedValue, fallbackValue) {
            // Not published means config.js is already in charge - nothing to
            // compare. A garbled value resolves to the fallback, so it also
            // compares equal and stays quiet.
            if (notMentioned(rawValue)) return;
            if (resolvedValue !== fallbackValue) {
                drift.push("  " + key + ": hbd.json=" + resolvedValue +
                    "  config.js=" + fallbackValue);
            }
        }

        compare("BASE_FEE", data.BASE_FEE, feeConfig.BASE_FEE, FALLBACK.BASE_FEE);
        compare("MIN_BASE_FEE", data.MIN_BASE_FEE, feeConfig.MIN_BASE_FEE, FALLBACK.MIN_BASE_FEE);
        compare("DIFF_COEFFICIENT", data.DIFF_COEFFICIENT,
            feeConfig.DIFF_COEFFICIENT, FALLBACK.DIFF_COEFFICIENT);
        compare("BASE_PRICE_HBD_TO_SHBD", data.BASE_PRICE_HBD_TO_SHBD,
            feeConfig.BASE_PRICE_HBD_TO_SHBD, FALLBACK.BASE_PRICE_HBD_TO_SHBD);
        compare("MINIMUM_LIQUIDITY", data.MINIMUM_LIQUIDITY,
            minimumLiquidity, FALLBACK.MINIMUM_LIQUIDITY);

        const rawVersion = data.VERSION || data.SCRIPT_VERSION || data.BACKEND_VERSION;
        compare("BACKEND_VERSION", rawVersion, backendVersion, FALLBACK.BACKEND_VERSION);

        if (drift.length > 0) {
            console.warn(
                "config.js is out of step with hbd.json on " + drift.length +
                " setting(s). hbd.json is in use now, but these config.js values " +
                "are what the app would fall back to if hbd.json became " +
                "unreachable - update js/config.js to match:\n" + drift.join("\n")
            );
        }
        return drift;
    }

    /**
     * Push the resolved versions into the footer. fetchFeeConfig runs again
     * before every swap, so without this the footer would keep showing the
     * version that happened to be live when the page first loaded.
     * Guarded because the first fetch happens before UIManager.initialize().
     */
    function refreshVersionDisplay() {
        if (typeof UIManager !== "undefined" && UIManager.updateVersions) {
            UIManager.updateVersions();
        }
    }

    let currentSwap = {
        from: "HBD",
        to: "SWAP.HBD",
        amount: 0,
        expected: 0,
        fee: 0,
        feePercent: 0,
        slippage: 0.02,
        minReceive: 0,
        // When true, skip slippage protection and accept whatever the bridge
        // sends back (memo "0") - ported from uswapapp's "No Minimum" checkbox.
        noMinimum: false
    };

    // ---------------------------------------------------------------------
    // @uswap account history, paged and cached.
    //
    // The bridge's reply to a swap can be any number of ops back in @uswap's
    // history - a fixed "last 100 ops" window (~20h of bridge activity)
    // silently missed older replies, leaving those swaps "Pending" forever.
    //
    // Lookups are staged to keep API load low (see findBridgeOps):
    //   1. search the newest 100 ops - covers every swap made today;
    //   2. only if the reply is not there, page back 1000 ops at a time,
    //      stopping as soon as it is found, once ops are older than the swap,
    //      or at BRIDGE_HISTORY_MAX_PAGES.
    //
    // Account history is append-only: the op at a given index never changes,
    // so pages already read are cached for the life of the page and only the
    // newest ops are re-read. A deep scan for an old swap is paid once.
    // ---------------------------------------------------------------------
    const HISTORY_HEAD_PROBE = 100; // cheap refresh of the newest ops
    const HISTORY_HEAD_TTL = 5000;  // reuse a head read this recent

    let bridgeOps = [];             // [index, op] pairs, ascending by index
    let bridgeHeadFetchedAt = 0;
    let bridgeHistoryQueue = Promise.resolve();

    function historyPageSize() {
        return Math.max(1, Math.min(1000, Utils.parseNumber(CONFIG.BRIDGE_HISTORY_PAGE_SIZE, 1000)));
    }

    function historyMaxOps() {
        return historyPageSize() * Math.max(1, Utils.parseNumber(CONFIG.BRIDGE_HISTORY_MAX_PAGES, 10));
    }

    async function fetchBridgePage(start, limit) {
        const page = await APIManager.tryWithFailover(() =>
            hive.api.getAccountHistoryAsync(CONFIG.BRIDGE_USER, start, limit)
        );
        return Array.isArray(page) ? page : [];
    }

    /**
     * Bring the newest end of the cache up to date.
     */
    async function refreshBridgeHead() {
        const newestKnown = bridgeOps.length ? bridgeOps[bridgeOps.length - 1][0] : null;

        // Always start with the cheap 100-op read - including on a cold
        // start. Deeper pages are only fetched when a lookup needs them.
        let head = await fetchBridgePage(-1, HISTORY_HEAD_PROBE);

        // More new ops than the probe covered - read a full page instead
        if (newestKnown !== null && head.length && head[0][0] > newestKnown + 1) {
            head = await fetchBridgePage(-1, historyPageSize());
            if (head.length && head[0][0] > newestKnown + 1) {
                // Still a gap between the cache and the head: start over
                // rather than keep a cache with a hole in it.
                bridgeOps = [];
            }
        }

        if (!bridgeOps.length) {
            bridgeOps = head.slice();
        } else {
            const newest = bridgeOps[bridgeOps.length - 1][0];
            bridgeOps = bridgeOps.concat(head.filter(item => item[0] > newest));
        }

        // Keep memory bounded on a long-lived tab. Trim only once we are a
        // full page over the cap, and back down to exactly the cap: trimming
        // on every new op would leave the cache just under the cap, and
        // extendBridgeHistory would then re-read a whole 1000-op page each
        // refresh to win back a handful of ops.
        const maxOps = historyMaxOps();
        if (bridgeOps.length > maxOps + historyPageSize()) {
            bridgeOps = bridgeOps.slice(bridgeOps.length - maxOps);
        }

        bridgeHeadFetchedAt = Date.now();
    }

    /**
     * Read ONE older page (1000 ops) onto the cache and return just the ops
     * it added - or null when there is nothing more worth reading: the cache
     * already reaches sinceMs, the start of the account, or the depth cap.
     */
    async function extendBridgeHistoryOnePage(sinceMs) {
        if (!sinceMs || bridgeOps.length === 0) return null;
        if (bridgeOps.length >= historyMaxOps()) return null;     // depth cap

        const oldest = bridgeOps[0];
        const oldestIndex = oldest[0];
        const oldestTime = Utils.parseChainTime(oldest[1] && oldest[1].timestamp);

        if (oldestIndex <= 0) return null;                        // whole history read
        if (isFinite(oldestTime) && oldestTime < sinceMs) return null; // older than the swap

        const start = oldestIndex - 1;
        // hived requires start >= limit - 1
        const limit = Math.min(historyPageSize(), start + 1);

        let page;
        try {
            page = await fetchBridgePage(start, limit);
        } catch (error) {
            // Keep what we already have rather than failing the whole check
            console.warn('Could not page further back in bridge history:', error.message);
            return null;
        }

        const older = page.filter(item => item[0] < oldestIndex);
        if (older.length === 0) return null; // node returned nothing new - stop
        bridgeOps = older.concat(bridgeOps);
        return older;
    }

    /**
     * Find @uswap history ops matching `predicate`, newest first.
     *
     * Stage 1 searches what is cached - on a cold start, just the newest 100
     * ops. Stage 2 runs only if nothing matched: it pages back 1000 ops at a
     * time, searching each new page, and stops at the first page with a match.
     * Calls are serialised so concurrent checks share one set of requests.
     */
    function findBridgeOps(predicate, sinceMs) {
        const safe = (item) => {
            try { return !!predicate(item); } catch (error) { return false; }
        };

        const run = bridgeHistoryQueue.then(async () => {
            if (!bridgeOps.length || Date.now() - bridgeHeadFetchedAt > HISTORY_HEAD_TTL) {
                await refreshBridgeHead();
            }

            let matches = bridgeOps.filter(safe);
            while (matches.length === 0) {
                const added = await extendBridgeHistoryOnePage(sinceMs);
                if (!added) break;
                matches = added.filter(safe);
            }
            return matches.reverse();
        });
        bridgeHistoryQueue = run.catch(() => {});
        return run;
    }

    /**
     * Earliest time a bridge reply to a swap recorded at `timestamp` could
     * appear, allowing for clock skew between this browser and the chain.
     */
    function replySince(timestamp) {
        const skew = Utils.parseNumber(CONFIG.BRIDGE_HISTORY_SKEW_MS, 10 * 60 * 1000);
        return (timestamp || Date.now()) - skew;
    }

    /**
     * Swap details the bridge writes into its reply memo, e.g.
     * "Thank you for using our service! Swapped Qty : 40.000 &
     *  Swapped Price : 0.997 & Tx : 1b5e1b02..."
     */
    function parseReplyMemo(memo) {
        const qtyMatch = memo.match(/Swapped Qty\s*:\s*([\d.]+)/);
        const priceMatch = memo.match(/Swapped Price\s*:\s*([\d.]+)/);
        return {
            swappedQty: qtyMatch ? qtyMatch[1] : null,
            swappedPrice: priceMatch ? priceMatch[1] : null
        };
    }

    /**
     * Hive Engine payload of a custom_json op, if it is a single SWAP.HBD
     * token transfer from the bridge to `username`; otherwise null.
     */
    function bridgeEngineTransferTo(item, username) {
        const op = item[1] && item[1].op;
        if (!op || op[0] !== 'custom_json' || op[1].id !== 'ssc-mainnet-hive') return null;

        const json = JSON.parse(op[1].json);
        if (json && json.contractName === 'tokens' &&
            json.contractAction === 'transfer' &&
            json.contractPayload &&
            json.contractPayload.to === username &&
            json.contractPayload.symbol === 'SWAP.HBD') {
            return json.contractPayload;
        }
        return null;
    }

    /**
     * Check uswap HBD transfers for completion confirmation.
     * HBD is a Hive (L1) transfer, so L1 history is the final word here.
     */
    async function checkUswapHiveTransfers(originalTxId, username, sinceMs) {
        try {
            // Structure: [index, {trx_id, block, op: [type, data], timestamp, ...}]
            const matches = await findBridgeOps((item) => {
                const op = item[1] && item[1].op;
                return op && op[0] === 'transfer' &&
                    op[1].from === CONFIG.BRIDGE_USER &&
                    op[1].to === username &&
                    String(op[1].memo || '').includes(originalTxId);
            }, sinceMs);

            if (matches.length === 0) {
                return { found: false };
            }

            const item = matches[0];
            const transferData = item[1].op[1];
            const memo = transferData.memo || '';
            return Object.assign({
                found: true,
                amount: transferData.amount,
                txId: item[1].trx_id,
                memo: memo
            }, parseReplyMemo(memo));
        } catch (error) {
            console.error('Error checking HBD transfers:', error);
            return { found: false };
        }
    }

    /**
     * Confirm a SWAP.HBD transfer on the Hive-Engine SIDECHAIN itself.
     *
     * Every SWAP.HBD leg of a swap is confirmed on Engine, in order:
     *   1. what came IN  - the user's deposit to the bridge (confirmDepositOnHiveEngine)
     *   2. what went OUT - the bridge's payout or refund   (confirmBridgeTransferOnHiveEngine)
     *
     * A `custom_json` op on Hive (L1) only proves someone BROADCAST an
     * instruction - Hive-Engine (L2) is a separate virtual machine that
     * processes it afterwards and can reject it (e.g. an insufficient-balance
     * error) even though the L1 broadcast succeeded. The "Valid" / "HE Block"
     * fields shown on a hivehub.dev transaction page come from this same
     * Engine record - so that is the ground truth checked here, via the SAME
     * node the rest of the app already talks to (APIManager.getSSC()).
     *
     * Returns:
     *   { confirmed: true,  amount }      - Engine applied the expected transfer
     *   { confirmed: false, engineError } - Engine processed it and rejected it
     *   { confirmed: false }              - not indexed by Engine yet (keep polling)
     */
    async function confirmTransferOnHiveEngine(trxId, expectedFrom, expectedTo) {
        const expectedSymbol = 'SWAP.HBD';

        const ssc = APIManager.getSSC();
        if (!ssc) {
            // No Engine node available yet - treat as "not confirmed yet" so the
            // caller keeps polling rather than wrongly reporting success or failure.
            return { confirmed: false };
        }

        let info;
        try {
            info = await Utils.retry(() => ssc.getTransactionInfo(trxId), 2, 1000);
        } catch (error) {
            console.error('Hive-Engine getTransactionInfo failed:', error);
            return { confirmed: false };
        }

        // Not indexed by this Engine node yet - L2 can lag a few seconds behind L1
        if (!info || !info.logs) {
            return { confirmed: false };
        }

        let logs;
        try {
            logs = JSON.parse(info.logs);
        } catch (error) {
            return { confirmed: false };
        }

        if (logs.errors && logs.errors.length > 0) {
            return { confirmed: false, engineError: logs.errors.join(', ') };
        }

        const transferEvent = (logs.events || []).find(ev =>
            ev.contract === 'tokens' &&
            ev.event === 'transfer' &&
            ev.data &&
            ev.data.from === expectedFrom &&
            ev.data.to === expectedTo &&
            ev.data.symbol === expectedSymbol
        );

        if (!transferEvent) {
            // Engine processed the transaction without error, but it did not
            // move the expected tokens between the expected accounts - so it
            // can never become the transfer we are waiting for.
            return {
                confirmed: false,
                engineError: 'Hive-Engine processed the transaction but it did not transfer ' +
                    expectedSymbol + ' from @' + expectedFrom + ' to @' + expectedTo
            };
        }

        // Ground truth: what Engine actually applied, not what the L1 payload claimed
        return { confirmed: true, amount: transferEvent.data.quantity };
    }

    /**
     * Step 1 - what came IN: the user's SWAP.HBD deposit to the bridge.
     * The bridge only acts on deposits Hive-Engine accepted, so a deposit
     * Engine rejected will never get a reply - better to say so at once than
     * to leave the swap "Pending" forever.
     */
    function confirmDepositOnHiveEngine(txIdSent, username) {
        return confirmTransferOnHiveEngine(txIdSent, username, CONFIG.BRIDGE_USER);
    }

    /**
     * Step 2 - what went OUT: the bridge's SWAP.HBD payout or refund.
     */
    function confirmBridgeTransferOnHiveEngine(trxId, username) {
        return confirmTransferOnHiveEngine(trxId, CONFIG.BRIDGE_USER, username);
    }
    /**
     * Check the SWAP.HBD the bridge sent out (payout of a HBD -> SWAP.HBD
     * swap, or refund of a SWAP.HBD deposit).
     * The bridge's custom_json is located through @uswap's L1 history (that
     * is where its memo, carrying our tx id, lives), but a match is only
     * reported `found: true` once Hive-Engine confirms it actually applied
     * that outgoing transfer - see confirmBridgeTransferOnHiveEngine above.
     */
    async function checkUswapEngineTransfers(originalTxId, username, sinceMs) {
        try {
            const matches = await findBridgeOps((item) => {
                const payload = bridgeEngineTransferTo(item, username);
                return payload && String(payload.memo || '').includes(originalTxId);
            }, sinceMs);

            // The bridge may have made more than one attempt (e.g. a retry after
            // a rejected payout). Any attempt Engine applied wins; an attempt
            // Engine has not indexed yet means keep waiting; only when EVERY
            // attempt was rejected is the payout reported as failed.
            let pending = false;
            let rejected = null;

            for (const item of matches) {
                const trxId = item[1].trx_id;
                const memo = bridgeEngineTransferTo(item, username).memo || '';

                const engineResult = await confirmBridgeTransferOnHiveEngine(trxId, username);

                if (engineResult.confirmed) {
                    return Object.assign({
                        found: true,
                        // Engine-confirmed amount, not the unverified L1 payload
                        amount: `${engineResult.amount} SWAP.HBD`,
                        txId: trxId,
                        memo: memo
                    }, parseReplyMemo(memo));
                }

                if (engineResult.engineError) {
                    rejected = rejected || { engineError: engineResult.engineError, txId: trxId };
                } else {
                    // Seen on L1 but Engine has not indexed it yet - the outer
                    // poll loop re-checks it next cycle.
                    pending = true;
                }
            }

            if (rejected && !pending) {
                return { found: false, engineError: rejected.engineError, txId: rejected.txId };
            }
            return { found: false };
        } catch (error) {
            console.error('Error checking Engine transfers:', error);
            return { found: false };
        }
    }

    /**
     * Look for the bridge's reply to one of our swaps.
     * Checks the expected payout token first, then the input token - the bridge
     * refunds in the original token when it cannot fill the swap.
     * Returns { found, outcome: 'completed'|'refunded', ... }
     */
    async function findBridgeReply(originalTxId, username, fromToken, toToken, sinceMs) {
        const lookup = (token) => token === "HBD"
            ? checkUswapHiveTransfers(originalTxId, username, sinceMs)
            : checkUswapEngineTransfers(originalTxId, username, sinceMs);

        const payout = await lookup(toToken);
        if (payout.found) {
            return Object.assign({ outcome: 'completed' }, payout);
        }

        if (payout.engineError) {
            // Hive-Engine explicitly rejected the payout meant for us (e.g. a
            // balance error on the sidechain). This will not resolve itself no
            // matter how long we poll, so surface it now instead of silently
            // retrying for the full timeout. If the bridge separately issues a
            // refund later, loadSwapHistory()'s periodic re-check will still
            // pick it up next time "My Recent Swaps" is viewed.
            return { found: false, outcome: 'engine-error', engineError: payout.engineError, txId: payout.txId };
        }

        const refund = await lookup(fromToken);
        if (refund.found) {
            return Object.assign({ outcome: 'refunded' }, refund);
        }

        return { found: false };
    }

    /**
     * Poll until the bridge replies (or we give up).
     *
     * The bridge credits the user in a separate transaction whose memo carries
     * our original transaction id, e.g.
     *   "Thank you for using our service! Swapped Qty : 40.000 &
     *    Swapped Price : 0.997 & Tx : 1b5e1b02...".
     * Until that shows up, the swap is only *submitted*, not complete.
     *
     * Order: confirm what came IN (the user's SWAP.HBD deposit, on
     * Hive-Engine), then confirm what went OUT (the bridge's payout/refund).
     */
    async function waitForSwapCompletion(originalTxId, username, fromToken, toToken) {
        const startedAt = Date.now();

        // A SWAP.HBD deposit only counts once Hive-Engine has accepted it -
        // that is what the bridge acts on. HBD deposits are plain L1
        // transfers, final as soon as the wallet reports the broadcast.
        let depositConfirmed = fromToken !== "SWAP.HBD";

        // Give the chain a moment before the first look
        await Utils.sleep(CONFIG.SWAP_VERIFY_INITIAL_DELAY);

        while (Date.now() - startedAt < CONFIG.SWAP_VERIFY_TIMEOUT) {
            const elapsed = Math.round((Date.now() - startedAt) / 1000);

            // 1. What came in
            if (!depositConfirmed) {
                UIManager.showLoading(`Confirming your SWAP.HBD transfer on Hive-Engine... (${elapsed}s)`);
                const deposit = await confirmDepositOnHiveEngine(originalTxId, username);
                if (deposit.engineError) {
                    // Rejected on the sidechain: the bridge never received
                    // anything, so there is no reply to wait for.
                    return { found: false, outcome: 'deposit-rejected', engineError: deposit.engineError };
                }
                // Not indexed yet (or the Engine node is slow) - still look for
                // the bridge's reply below: a reply proves the deposit landed,
                // and a lagging Engine node must not hold up a finished swap.
                depositConfirmed = deposit.confirmed;
            }

            // 2. What went out
            UIManager.showLoading(`Waiting for the bridge to send your ${toToken}... (${elapsed}s)`);

            const reply = await findBridgeReply(
                originalTxId, username, fromToken, toToken, replySince(startedAt)
            );
            if (reply.found || reply.outcome === 'engine-error') {
                return reply;
            }

            await Utils.sleep(CONFIG.SWAP_VERIFY_INTERVAL);
        }

        return { found: false, timedOut: true };
    }

    /**
     * Update a stored swap record once the bridge has replied
     */
    function markSwapResolved(txIdSent, username, reply) {
        try {
            const history = JSON.parse(localStorage.getItem(CONFIG.SWAP_HISTORY_KEY) || '[]');
            const record = history.find(h => h.txIdSent === txIdSent && h.username === username);
            if (!record) return;

            record.status = reply.outcome;
            record.amountReceived = reply.amount || null;
            record.txIdReceived = reply.txId || null;
            record.swappedQty = reply.swappedQty || null;
            record.swappedPrice = reply.swappedPrice || null;
            if (reply.engineError) {
                record.engineError = reply.engineError;
            } else {
                delete record.engineError;
            }

            localStorage.setItem(CONFIG.SWAP_HISTORY_KEY, JSON.stringify(history));
        } catch (error) {
            console.error('Could not update swap record:', error);
        }
    }

    /**
     * Add swap to history tracking
     */
    function addSwapToHistory(txId, amount, fromToken, username) {
        const swapRecord = {
            timestamp: Date.now(),
            txIdSent: txId,
            amountSent: `${amount.toFixed(3)} ${fromToken}`,
            fromToken: fromToken,
            toToken: fromToken === "HBD" ? "SWAP.HBD" : "HBD",
            username: username,
            status: 'pending',
            txIdReceived: null,
            amountReceived: null
        };

        // Get existing history from localStorage
        let history = JSON.parse(localStorage.getItem(CONFIG.SWAP_HISTORY_KEY) || '[]');
        
        // Add new record at the beginning
        history.unshift(swapRecord);
        
        // Keep only last 10 swaps per user
        const userHistory = history.filter(h => h.username === username).slice(0, 10);
        const otherHistory = history.filter(h => h.username !== username);
        history = [...userHistory, ...otherHistory];
        
        // Save to localStorage
        localStorage.setItem(CONFIG.SWAP_HISTORY_KEY, JSON.stringify(history));
        
        // Update UI
        UIManager.updateSwapHistory();
    }

    /**
     * Was the user's transaction broadcast to Hive at all?
     *
     * Both swap directions start with a Hive (L1) transaction - a HBD
     * transfer, or the custom_json carrying a SWAP.HBD transfer - so L1 is
     * the definitive answer to "was it sent". (Whether Hive-Engine then
     * ACCEPTED a SWAP.HBD deposit is checked separately, see
     * confirmDepositOnHiveEngine. Engine "not found" is not used here: Engine
     * can lag L1 by well over 30s, and "not-sent" is permanent.)
     *
     * Returns true / false, or null when it could not be determined (node
     * timeout...). Only a definite `false` may mark a swap "not-sent" - a
     * transient node error used to do so permanently, inviting the user to
     * send the same swap again.
     */
    async function verifyTransactionExists(txId) {
        try {
            const tx = await APIManager.tryWithFailover(() =>
                hive.api.getTransactionAsync(txId)
            );
            return tx !== null && tx !== undefined;
        } catch (error) {
            // hived answers an unknown id with "Unknown Transaction <id>"
            if (/unknown transaction/i.test((error && error.message) || '')) {
                return false;
            }
            console.warn('Could not verify transaction', txId, error && error.message);
            return null;
        }
    }

    /**
     * Load and check swap history status
     */
    async function loadSwapHistory(username) {
        if (!username) return [];

        let history = JSON.parse(localStorage.getItem(CONFIG.SWAP_HISTORY_KEY) || '[]');
        const userHistory = history.filter(h => h.username === username);
        
        // Check status for pending swaps AND re-check completed swaps with old data
        for (let swap of userHistory) {
            // Repair records saved by older builds, which could store the whole
            // Keychain result object as the tx id. A string id can still be
            // matched against the bridge's memo; an unrecoverable one cannot,
            // so drop it rather than render "[object Object]".
            if (swap.txIdSent && typeof swap.txIdSent !== 'string') {
                swap.txIdSent = Utils.extractTxId(swap.txIdSent);
            }
            if (swap.txIdReceived && typeof swap.txIdReceived !== 'string') {
                swap.txIdReceived = Utils.extractTxId(swap.txIdReceived);
            }
            if (!swap.txIdSent) {
                continue; // nothing to match the bridge's reply against
            }

            // Re-check completed swaps that have 'uswap-transfer' or 'uswap-refund' placeholder
            if ((swap.status === 'completed' || swap.status === 'refunded') && 
                (swap.txIdReceived === 'uswap-transfer' || swap.txIdReceived === 'uswap-refund')) {
                // Re-fetch to get actual transaction ID
                const toToken = swap.toToken;
                let result;
                
                if (toToken === "HBD") {
                    result = await checkUswapHiveTransfers(swap.txIdSent, username, replySince(swap.timestamp));
                } else {
                    result = await checkUswapEngineTransfers(swap.txIdSent, username, replySince(swap.timestamp));
                }
                
                if (result.found) {
                    swap.txIdReceived = result.txId;
                }
            }
            
            if (swap.status === 'pending') {
                // 1. What came in. SWAP.HBD deposit: confirm on Hive-Engine,
                // which is what the bridge acts on. Checked once - a confirmed
                // deposit is final. (HBD deposits are plain L1 transfers.)
                if (swap.fromToken === "SWAP.HBD" && !swap.depositConfirmed) {
                    const deposit = await confirmDepositOnHiveEngine(swap.txIdSent, username);
                    if (deposit.engineError) {
                        // Rejected on the sidechain - the bridge never got it and
                        // will never reply. Final; not re-checked after this.
                        swap.status = 'failed';
                        swap.engineError = deposit.engineError;
                        continue;
                    }
                    if (deposit.confirmed) {
                        swap.depositConfirmed = true;
                    }
                    // Not indexed yet (Engine lag): carry on - a bridge reply
                    // below still settles the swap.
                }

                // 2. What went out: the bridge's payout (or a refund below)
                const toToken = swap.toToken;
                let result;

                if (toToken === "HBD") {
                    result = await checkUswapHiveTransfers(swap.txIdSent, username, replySince(swap.timestamp));
                } else {
                    result = await checkUswapEngineTransfers(swap.txIdSent, username, replySince(swap.timestamp));
                }

                if (result.found) {
                    swap.status = 'completed';
                    swap.amountReceived = result.amount;
                    swap.txIdReceived = result.txId;
                    swap.swappedQty = result.swappedQty;
                    swap.swappedPrice = result.swappedPrice;
                    delete swap.engineError;
                    continue;
                }

                // Hive-Engine explicitly rejected the payout meant for us. This
                // proves the original transaction WAS received and processed as
                // far as attempting a payout, so it's a distinct state from
                // "not-sent" below - remember it, but keep polling for a refund.
                if (result.engineError) {
                    swap.engineError = result.engineError;
                } else {
                    delete swap.engineError;
                }

                // Not completed, check for refund (same token returned)
                if (swap.fromToken === "HBD") {
                    const refund = await checkUswapHiveTransfers(swap.txIdSent, username, replySince(swap.timestamp));
                    if (refund.found) {
                        swap.status = 'refunded';
                        swap.amountReceived = refund.amount;
                        swap.txIdReceived = refund.txId;
                        delete swap.engineError;
                        continue;
                    }
                } else {
                    const refund = await checkUswapEngineTransfers(swap.txIdSent, username, replySince(swap.timestamp));
                    if (refund.found) {
                        swap.status = 'refunded';
                        swap.amountReceived = refund.amount;
                        swap.txIdReceived = refund.txId;
                        delete swap.engineError;
                        continue;
                    }
                }

                // Hive-Engine already rejected a payout attempt for this tx, so
                // we KNOW the deposit arrived - nothing more to verify here.
                if (swap.engineError) {
                    continue;
                }

                if (swap.depositConfirmed) {
                    continue; // deposit is good - just waiting on the bridge
                }

                // Not completed and not refunded
                // Give time for blockchain/side chain to process before checking existence
                const now = Date.now();
                const swapAge = now - swap.timestamp; // in milliseconds
                const minimumWaitTime = 30 * 1000; // 30 seconds
                const maximumWaitTime = 10 * 60 * 1000; // 10 minutes

                // Only check if transaction exists after minimum wait time.
                if (swapAge > minimumWaitTime && swapAge < maximumWaitTime) {
                    const txExists = await verifyTransactionExists(swap.txIdSent);

                    // null = could not tell (node trouble): stay pending and
                    // look again next refresh rather than claim "not sent".
                    if (txExists === false) {
                        swap.status = 'not-sent';
                    }
                }
                // If less than 30 seconds or more than 10 minutes, keep as pending
            }
        }
        
        // Merge results into the CURRENT stored history rather than writing
        // back the snapshot read above. The checks can take several seconds
        // (paging back through bridge history), and meanwhile a new swap may
        // have been recorded (addSwapToHistory) or resolved (markSwapResolved)
        // - writing the stale snapshot would silently erase that.
        const merged = mergeSwapUpdates(userHistory);

        return merged.filter(h => h.username === username).slice(0, 10);
    }

    /**
     * Write checked records back into the latest stored history.
     * Records are identified by username + timestamp + token + amount, none of which change
     * (txIdSent can, when a legacy record is repaired). A record that was
     * resolved elsewhere in the meantime is not reverted to "pending".
     */
    function mergeSwapUpdates(checked) {
        const key = (h) => [h.username, h.timestamp, h.fromToken, h.amountSent].join('|');
        const updates = new Map(checked.map(h => [key(h), h]));

        let latest;
        try {
            latest = JSON.parse(localStorage.getItem(CONFIG.SWAP_HISTORY_KEY) || '[]');
        } catch (error) {
            latest = [];
        }

        const merged = latest.map(stored => {
            const update = updates.get(key(stored));
            if (!update) return stored;
            if (stored.status !== 'pending' && update.status === 'pending') return stored;
            return update;
        });

        localStorage.setItem(CONFIG.SWAP_HISTORY_KEY, JSON.stringify(merged));
        return merged;
    }

    /**
     * Fetch fee configuration from server
     */
    async function fetchFeeConfig() {
        try {
            // Retry with a longer timeout: a cold DNS/TLS connect can exceed 5s,
            // and on failure the app falls back to the config.js constants.
            // That is harmless only while they match the server; if the
            // operator changes fees, a timed-out fetch would make the UI quote
            // and send the wrong minimum-receive memo. Keep config.js in step
            // with hbd.json so a fallback is never a surprise.
            const response = await Utils.retry(
                () => Utils.withTimeout(axios.get(CONFIG.USWAP_FEE_JSON), 8000),
                2, 1000
            );
            
            // An answer with no body tells us nothing, so treat it as a miss
            // and let config.js apply rather than keeping stale values.
            if (!response || !response.data || typeof response.data !== "object") {
                throw new Utils.APIError("hbd.json returned no usable data");
            }

            const data = response.data;

            // Each field: hbd.json when it publishes a usable value, else
            // config.js. Never the previous fetch's value - see FALLBACK.
            feeConfig.BASE_FEE = pickNumber(data.BASE_FEE, FALLBACK.BASE_FEE);
            feeConfig.MIN_BASE_FEE = pickNumber(data.MIN_BASE_FEE, FALLBACK.MIN_BASE_FEE);
            feeConfig.DIFF_COEFFICIENT = pickNumber(data.DIFF_COEFFICIENT, FALLBACK.DIFF_COEFFICIENT);
            feeConfig.BASE_PRICE_HBD_TO_SHBD = pickPositiveNumber(
                data.BASE_PRICE_HBD_TO_SHBD, FALLBACK.BASE_PRICE_HBD_TO_SHBD
            );

            // Minimum combined liquidity required to allow swaps
            minimumLiquidity = pickNumber(data.MINIMUM_LIQUIDITY, FALLBACK.MINIMUM_LIQUIDITY);

            // Operator kill switch
            bridgeStopped = pickFlag(data.IS_STOPPED, FALLBACK.IS_STOPPED);

            // Prefer a version published by the bridge itself so the footer
            // reflects reality rather than a value hardcoded at build time.
            // Accepts a few likely key names.
            const publishedVersion = data.VERSION || data.SCRIPT_VERSION || data.BACKEND_VERSION;
            if (notMentioned(publishedVersion)) {
                backendVersion = FALLBACK.BACKEND_VERSION;
                backendVersionSource = "config.js";
            } else {
                backendVersion = String(publishedVersion);
                backendVersionSource = "hbd.json";
            }

            console.log("Fee config loaded from hbd.json:", feeConfig,
                "| stopped:", bridgeStopped,
                "| minLiquidity:", minimumLiquidity,
                "| backend:", backendVersion, "(" + backendVersionSource + ")");

            // Surface any disagreement between hbd.json and the config.js
            // fallback, so drift is found now rather than during an outage.
            warnOnConfigDrift(data);

            refreshVersionDisplay();
        } catch (error) {
            // hbd.json unreachable or unusable - fall back to config.js in
            // full, so nothing it served earlier in this session survives.
            applyFallbackConfig();
            const handled = Utils.handleError(error, 'SwapManager.fetchFeeConfig');
            console.error(handled.message);
            console.warn("hbd.json unavailable - using config.js values:", feeConfig,
                "| stopped:", bridgeStopped,
                "| minLiquidity:", minimumLiquidity);
            refreshVersionDisplay();
        }
    }

    /**
     * Calculate swap fee and output based on amount and direction
     * Uses the exact formula from the original uswap.app
     */
    function calculateFee(amount, fromToken, toToken) {
        if (!Utils.isPositiveNumber(amount)) {
            return { feeAmount: 0, feePercent: 0 };
        }

        // Pool sizes drive the fee curve. Use the real @uswap balances once
        // MarketManager has them; until then fall back to an even split of
        // MINIMUM_LIQUIDITY rather than a separate hardcoded pair.
        const liq = MarketManager.getLiquidity();
        const seed = Utils.parseNumber(minimumLiquidity, 0) / 2;
        const hivePool = liq.hive > 0 ? liq.hive : seed;
        const shivePool = liq.swapHive > 0 ? liq.swapHive : seed;

        const fromPool = fromToken === "HBD" ? hivePool : shivePool;
        const totalPool = hivePool + shivePool;
        
        // Calculate pool difference ratio
        const diff = ((amount * 0.5 + fromPool) / totalPool) - 0.5;
        
        // Calculate adjusted base fee (lower when balancing pools)
        const adjusted_base_fee = Math.max(
            feeConfig.BASE_FEE * (1 - 2 * Math.abs(diff)),
            feeConfig.MIN_BASE_FEE
        );
        
        // Calculate price with pool imbalance adjustment
        let price;
        if (fromToken === "HBD") {
            price = feeConfig.BASE_PRICE_HBD_TO_SHBD - (2 * diff * feeConfig.DIFF_COEFFICIENT);
        } else {
            price = (1 / feeConfig.BASE_PRICE_HBD_TO_SHBD) - (2 * diff * feeConfig.DIFF_COEFFICIENT);
        }
        
        // Calculate expected output
        const expectedOutput = (amount * price) * (1 - adjusted_base_fee);
        
        // Calculate fee amount in input token
        const feeAmount = amount * adjusted_base_fee;
        const feePercent = adjusted_base_fee * 100;
        
        return {
            feeAmount: Utils.roundTo(feeAmount, 8),
            feePercent: Utils.roundTo(feePercent, 4),
            expectedOutput: Utils.roundTo(expectedOutput, 8)
        };
    }

    /**
     * Calculate expected output amount
     * Uses the new calculateFee function that includes output
     */
    function calculateExpectedOutput(inputAmount, fromToken, toToken) {
        if (!Utils.isPositiveNumber(inputAmount)) {
            return { expected: 0, fee: 0, feePercent: 0 };
        }

        const result = calculateFee(inputAmount, fromToken, toToken);

        return {
            expected: Math.floor(result.expectedOutput * CONFIG.DECIMAL) / CONFIG.DECIMAL,
            fee: result.feeAmount,
            feePercent: result.feePercent
        };
    }

    /**
     * Update swap calculation
     */
    function updateSwapCalculation(amount, fromToken, toToken, slippage) {
        currentSwap.from = fromToken;
        currentSwap.to = toToken;
        currentSwap.amount = Utils.parseNumber(amount, 0);
        currentSwap.slippage = Utils.parseNumber(slippage, 0.02);

        const result = calculateExpectedOutput(currentSwap.amount, fromToken, toToken);
        currentSwap.expected = result.expected;
        currentSwap.fee = result.fee;
        currentSwap.feePercent = result.feePercent;
        
        // Calculate minimum receive with slippage protection
        const slippageFactor = 1 - (currentSwap.slippage / 100);
        currentSwap.minReceive = Utils.roundTo(
            Utils.safeMultiply(currentSwap.expected, slippageFactor),
            3
        );

        // Update UI
        UIManager.updateSwapDisplay(currentSwap);
        
        // Validate and enable/disable swap button
        validateSwapButton();

        return currentSwap;
    }

    /**
     * Toggle "No Minimum" mode (ported from uswapapp's noMemoCheck checkbox).
     * When enabled, executeSwap() sends memo "0" instead of the computed
     * minimum-receive amount, so the bridge accepts any output amount.
     */
    function setNoMinimum(enabled) {
        currentSwap.noMinimum = !!enabled;
        // Re-validate in case this flips the button between enabled/disabled
        validateSwapButton();
    }

    /**
     * Reverse swap direction
     */
    function reverseSwap() {
        const temp = currentSwap.from;
        currentSwap.from = currentSwap.to;
        currentSwap.to = temp;

        // Update UI selects
        const inputSelect = document.getElementById("input");
        const outputSelect = document.getElementById("output");
        if (inputSelect) {
            inputSelect.value = currentSwap.from;
            inputSelect.dispatchEvent(new Event('change'));
        }
        if (outputSelect) {
            outputSelect.value = currentSwap.to;
            outputSelect.dispatchEvent(new Event('change'));
        }

        // Recalculate if amount exists
        if (Utils.isPositiveNumber(currentSwap.amount)) {
            updateSwapCalculation(
                currentSwap.amount, 
                currentSwap.from, 
                currentSwap.to, 
                currentSwap.slippage
            );
        }

        // Update fee ticker labels
        const feeTicker = document.getElementById("feeticker");
        const minReceiveSymbol = document.getElementById("minreceivesymbol");
        if (feeTicker) feeTicker.textContent = currentSwap.from;
        if (minReceiveSymbol) minReceiveSymbol.textContent = currentSwap.to;
    }

    /**
     * Validate if swap button should be enabled
     * Can be called with parameters or will use currentSwap values
     */
    function validateSwapButton(inputAmount = null, inputFrom = null, inputTo = null) {
        const amount = inputAmount !== null ? inputAmount : currentSwap.amount;
        const fromToken = inputFrom || currentSwap.from;
        const toToken = inputTo || currentSwap.to;

        // Operator has paused the bridge - block swaps outright
        if (bridgeStopped) {
            UIManager.setSwapBlocked(
                "Swaps are paused by the bridge operator. Please try again later."
            );
            UIManager.disableSwapButton();
            return false;
        }

        // Bridge must hold enough combined liquidity to operate
        const pooled = MarketManager.getLiquidity();
        const totalLiquidity = Utils.parseNumber(pooled.hive, 0) + Utils.parseNumber(pooled.swapHive, 0);
        if (minimumLiquidity > 0 && totalLiquidity > 0 && totalLiquidity < minimumLiquidity) {
            UIManager.setSwapBlocked(
                "Bridge liquidity (" + Utils.formatNumber(totalLiquidity, 3) +
                ") is below the " + Utils.formatNumber(minimumLiquidity, 0) +
                " minimum, so swaps are paused."
            );
            UIManager.disableSwapButton();
            return false;
        }

        UIManager.setSwapBlocked(null);
        
        // Check if amount is valid and positive
        if (!amount || !Utils.isPositiveNumber(amount) || amount <= 0) {
            UIManager.disableSwapButton();
            return false;
        }

        // Check if amount meets minimum requirement
        if (amount < CONFIG.MINIMUM_SWAP) {
            UIManager.disableSwapButton();
            return false;
        }

        // Check if user has sufficient balance
        const balances = WalletManager.getBalances();
        const availableBalance = Utils.parseNumber(balances[fromToken], 0);
        
        if (availableBalance < amount) {
            UIManager.disableSwapButton();
            return false;
        }

        // Check if bridge has sufficient liquidity for the output token
        const liquidity = MarketManager.getLiquidity();
        const expectedOutput = calculateExpectedOutput(amount, fromToken, toToken).expected;
        
        // Map token to liquidity key
        const liquidityKey = toToken === "HBD" ? "hive" : "swapHive";
        const availableLiquidity = Utils.parseNumber(liquidity[liquidityKey], 0);
        
        if (expectedOutput > availableLiquidity) {
            UIManager.disableSwapButton();
            return false;
        }

        // All validations passed - enable button
        UIManager.enableSwapButton();
        return true;
    }

    /**
     * Validate swap (returns validation result)
     */
    function validateSwap() {
        const username = WalletManager.getCurrentUser();
        if (!username) {
            throw new Utils.ValidationError("Please load your wallet first");
        }

        const balance = WalletManager.getBalance(currentSwap.from);
        const validation = Utils.validateSwapAmount(
            currentSwap.amount,
            balance,
            CONFIG.MINIMUM_SWAP
        );

        if (!validation.valid) {
            throw new Utils.ValidationError(validation.errors.join('. '));
        }

        return true;
    }

    /**
     * Execute HBD to SWAP.HBD swap with Keychain
     */
    async function executeHiveToSwapHive(amount, username, memo) {
        return new Promise((resolve, reject) => {
            if (!window.hive_keychain) {
                reject(new Utils.TransactionError("Hive Keychain extension not found. Please install it."));
                return;
            }

            const transferAmount = Utils.roundTo(amount, 3).toFixed(3) + " HBD";

            hive_keychain.requestTransfer(
                username,
                CONFIG.BRIDGE_USER,
                Utils.roundTo(amount, 3).toFixed(3),
                memo,
                "HBD",
                (response) => {
                    if (response.success) {
                        // Extract transaction ID from response
                        const txId = Utils.extractTxId(response.result);
                        resolve({ 
                            success: true, 
                            transactionId: txId,
                            response: response 
                        });
                    } else {
                        reject(new Utils.TransactionError(
                            response.message || "Transaction rejected",
                            null
                        ));
                    }
                }
            );
        });
    }

    /**
     * Execute SWAP.HBD to HBD swap with Keychain
     */
    async function executeSwapHiveToHive(amount, username, memo) {
        return new Promise((resolve, reject) => {
            if (!window.hive_keychain) {
                reject(new Utils.TransactionError("Hive Keychain extension not found. Please install it."));
                return;
            }

            const json = JSON.stringify({
                contractName: "tokens",
                contractAction: "transfer",
                contractPayload: {
                    symbol: "SWAP.HBD",
                    to: CONFIG.BRIDGE_USER,
                    quantity: Utils.roundTo(amount, 3).toFixed(3),
                    memo: memo
                }
            });

            hive_keychain.requestCustomJson(
                username,
                "ssc-mainnet-hive",
                "Active",
                json,
                "SWAP.HBD Transfer",
                (response) => {
                    if (response.success) {
                        // Extract transaction ID from response
                        const txId = Utils.extractTxId(response.result);
                        resolve({ 
                            success: true, 
                            transactionId: txId,
                            response: response 
                        });
                    } else {
                        reject(new Utils.TransactionError(
                            response.message || "Transaction rejected",
                            null
                        ));
                    }
                }
            );
        });
    }

    /**
     * Execute HBD or SWAP.HBD transfer to the bridge via Hive Auth (HAS)
     */
    async function executeSwapViaHiveAuth(amount, username, memo, fromToken) {
        if (!HiveAuthManager.isSupported()) {
            throw new Utils.TransactionError("Hive Auth is not supported in this browser.");
        }
        const formattedAmount = Utils.roundTo(amount, 3).toFixed(3);
        return await HiveAuthManager.requestTransfer(username, formattedAmount, fromToken, memo);
    }

    /**
     * Execute swap with comprehensive error handling
     */
    async function executeSwap() {
        try {
            // Re-read the operator controls immediately before submitting. The
            // page may have been open for a long time, and sending funds into a
            // bridge that has since been paused is exactly what IS_STOPPED is
            // meant to prevent. Also refreshes fees so the memo is computed
            // from current values.
            await fetchFeeConfig();
            if (bridgeStopped) {
                throw new Utils.ValidationError(
                    "Swaps are paused by the bridge operator. Nothing was sent."
                );
            }

            // Validate swap
            validateSwap();

            UIManager.showLoading("Processing swap...");
            UIManager.disableSwapButton();

            const username = WalletManager.getCurrentUser();
            const minReceiveFormatted = Utils.roundTo(currentSwap.minReceive, 3).toFixed(3);
            // "No Minimum" mode sends memo "0" so the bridge accepts any output amount
            const memo = currentSwap.noMinimum ? "0" : minReceiveFormatted;

            const authMethodEl = document.querySelector('input[name="txtype"]:checked');
            const authMethod = authMethodEl ? authMethodEl.value : "Hive Keychain";

            let result;
            if (authMethod === "Hive Auth") {
                UIManager.showLoading(`Confirm the transaction through Hive Auth.`);
                result = await executeSwapViaHiveAuth(currentSwap.amount, username, memo, currentSwap.from);
            } else if (currentSwap.from === "HBD") {
                result = await executeHiveToSwapHive(currentSwap.amount, username, memo);
            } else {
                result = await executeSwapHiveToHive(currentSwap.amount, username, memo);
            }

            const fromToken = currentSwap.from;
            const toToken = currentSwap.to;

            // Record it as pending straight away so it survives a page reload
            if (result.transactionId) {
                addSwapToHistory(result.transactionId, currentSwap.amount, fromToken, username);
            }

            UIManager.clearSwapInputs();

            // Without a transaction id we cannot match the bridge's reply, so be
            // honest rather than claiming the swap went through.
            if (!result.transactionId) {
                UIManager.hideLoading();
                UIManager.showSuccess("Transaction submitted. Check 'My Recent Swaps' for the result.");
                setTimeout(() => WalletManager.refreshBalance(), 10000);
                return true;
            }

            // Submitted != swapped. The bridge credits the user in a separate
            // transaction, so wait for that before reporting success.
            const reply = await waitForSwapCompletion(
                result.transactionId, username, fromToken, toToken
            );

            UIManager.hideLoading();

            if (reply.found) {
                markSwapResolved(result.transactionId, username, reply);

                if (reply.outcome === 'refunded') {
                    UIManager.showError(
                        `Swap could not be filled - ${reply.amount} was refunded to your wallet.`
                    );
                } else {
                    const detail = reply.swappedQty && reply.swappedPrice
                        ? ` (swapped ${reply.swappedQty} at ${reply.swappedPrice})`
                        : "";
                    UIManager.showSuccess(`Swap complete! Received ${reply.amount}${detail}.`);
                }
            } else if (reply.outcome === 'deposit-rejected') {
                // The user's own SWAP.HBD transfer failed on Hive-Engine, so
                // nothing reached the bridge and no reply will ever come.
                markSwapResolved(result.transactionId, username,
                    { outcome: 'failed', engineError: reply.engineError });
                UIManager.showError(
                    `Hive-Engine rejected your SWAP.HBD transfer (${reply.engineError}). ` +
                    `Nothing was sent to the bridge.`
                );
            } else if (reply.outcome === 'engine-error') {
                // The bridge's payout was rejected by Hive-Engine itself (layer 2),
                // not just "not confirmed yet" - retrying will not fix this.
                UIManager.showError(
                    `Your ${fromToken} was received, but Hive-Engine rejected the payout ` +
                    `(${reply.engineError}). Check 'My Recent Swaps' - a refund may follow.`
                );
            } else {
                // Still not visible on chain - do not claim success
                UIManager.showError(
                    "Transaction sent, but the bridge has not replied yet. " +
                    "Check 'My Recent Swaps' in a few minutes."
                );
            }

            await WalletManager.refreshBalance();
            UIManager.updateSwapHistory();

            return true;

        } catch (error) {
            const handled = Utils.handleError(error, 'SwapManager.executeSwap');
            UIManager.hideLoading();
            UIManager.showError(handled.message);
            // Re-validate button after error
            validateSwapButton();
            return false;
        }
    }

    /**
     * Get current swap details
     */
    function getCurrentSwap() {
        return currentSwap;
    }

    /**
     * Initialize swap module
     */
    async function initialize() {
        await fetchFeeConfig();
        console.log("Swap Manager initialized");
    }

    // Public API
    return {
        initialize,
        updateSwapCalculation,
        reverseSwap,
        executeSwap,
        getCurrentSwap,
        calculateExpectedOutput,
        validateButton: validateSwapButton,
        loadSwapHistory,
        setNoMinimum,
        getBackendVersion: () => backendVersion,
        getBackendVersionSource: () => backendVersionSource,
        isBridgeStopped: () => bridgeStopped,
        getMinimumLiquidity: () => minimumLiquidity
    };
})();
