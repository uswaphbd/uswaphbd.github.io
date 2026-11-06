/**
 * Wallet Module
 * Handles wallet balance loading and management with improved error handling
 */

const WalletManager = (function() {
    let currentUser = null;
    let balances = {
        HBD: 0,
        "SWAP.HBD": 0
    };
    
    // Cache for balance refresh
    let lastFetch = null;
    const CACHE_DURATION = 30000; // 30 seconds (increased from 10)
    let loadBalanceTimeout = null; // Debounce timer

    /**
     * Query Hive Engine with Promise wrapper
     */
    function queryHiveEngine(contract, table, query, limit = 1000) {
        // Promise form only - do NOT pass a callback: sscjs's send() fires a
        // second identical request when one is given. Runs through
        // APIManager's Engine failover, so one dead or slow Engine node no
        // longer breaks balances and liquidity.
        return APIManager.tryEngineWithFailover(
            (ssc) => ssc.find(contract, table, query, limit, 0, [])
        )
            .then(result => result || [])
            .catch(error => {
                throw new Utils.APIError((error && error.message) || 'Query failed');
            });
    }

    /**
     * Fetch HBD balance with retry and node failover
     */
    async function fetchHiveBalance(username) {
        const accounts = await APIManager.tryWithFailover(
            () => hive.api.getAccountsAsync([username])
        );

        if (!accounts || accounts.length === 0) {
            throw new Utils.ValidationError('Account not found');
        }

        const hiveBalance = Utils.parseNumber(accounts[0].hbd_balance, 0);
        return Utils.floorTo(hiveBalance, 3);
    }

    /**
     * Fetch SWAP.HBD balance with retry
     */
    async function fetchSwapHiveBalance(username) {
        const tokens = await queryHiveEngine('tokens', 'balances', {
            account: username,
            symbol: 'SWAP.HBD'
        });

        const swapHiveBalance = tokens && tokens.length > 0 
            ? Utils.parseNumber(tokens[0].balance, 0)
            : 0;

        return Utils.floorTo(swapHiveBalance, 3);
    }

    /**
     * Load user balances from Hive and Hive Engine
     * With debouncing to prevent rapid API calls.
     *
     * options.silent - a background refresh (the 30s timer, tab focus, the
     *   refresh after a swap): no spinner and no message in the status line,
     *   which belongs to whatever the user is doing (e.g. a swap's progress
     *   or its result). Errors still go to the console. A refresh while a
     *   swap is running is always silent.
     */
    let pendingResolvers = []; // callers of a debounced load waiting on its result

    async function loadBalance(username, forceRefresh = false, options = {}) {
        const silent = !!options.silent ||
            (typeof SwapManager !== "undefined" && SwapManager.isSwapInProgress && SwapManager.isSwapInProgress());

        // Validate username
        const sanitized = Utils.sanitizeUsername(username);
        if (!Utils.isValidUsername(sanitized)) {
            if (!silent) UIManager.showError("\"" + sanitized + "\" is not a valid Hive username");
            return null;
        }

        // Check cache (skip if force refresh)
        const now = Date.now();
        if (!forceRefresh && currentUser === sanitized && lastFetch && (now - lastFetch) < CACHE_DURATION) {
            console.log(`⚡ Using cached balance (${Math.floor((CACHE_DURATION - (now - lastFetch)) / 1000)}s remaining)`);
            return balances;
        }

        // Debounce: Clear previous timeout. Its callers are not dropped -
        // they get this load's result (they used to wait forever).
        if (loadBalanceTimeout) {
            clearTimeout(loadBalanceTimeout);
        }

        return new Promise((resolve) => {
            pendingResolvers.push(resolve);
            loadBalanceTimeout = setTimeout(async () => {
                loadBalanceTimeout = null;
                const waiting = pendingResolvers;
                pendingResolvers = [];
                const result = await runLoad(sanitized, silent);
                waiting.forEach(done => done(result));
            }, 500); // 500ms debounce delay
        });
    }

    async function runLoad(sanitized, silent) {
        const switching = currentUser !== sanitized;
        try {
            if (!silent) UIManager.showLoading("Loading balances...");

            console.log(`🔄 Fetching fresh balance for @${sanitized}...`);

            // Fetch both balances in parallel. HBD is required; SWAP.HBD
            // comes from Hive Engine, and an Engine outage must not stop the
            // wallet loading (it used to block even the HBD balance).
            const [hiveResult, swapHiveResult] = await Promise.allSettled([
                fetchHiveBalance(sanitized),
                fetchSwapHiveBalance(sanitized)
            ]);

            if (hiveResult.status === 'rejected') {
                throw hiveResult.reason;
            }

            let swapHiveBalance;
            let engineWarning = null;
            if (swapHiveResult.status === 'fulfilled') {
                swapHiveBalance = swapHiveResult.value;
            } else {
                console.warn('SWAP.HBD balance unavailable:', swapHiveResult.reason && swapHiveResult.reason.message);
                // Same account: keep its last known SWAP.HBD balance. New
                // account: 0, which keeps SWAP.HBD -> HBD swaps disabled
                // until the real balance can be read.
                swapHiveBalance = switching ? 0 : balances["SWAP.HBD"];
                if (switching) {
                    engineWarning = "HBD balance loaded, but the SWAP.HBD balance could not be read " +
                        "(Hive Engine is not responding). HBD → SWAP.HBD swaps still work; " +
                        "try again shortly or pick another Hive Engine node.";
                }
            }

            // Update state
            balances.HBD = hiveResult.value;
            balances["SWAP.HBD"] = swapHiveBalance;
            currentUser = sanitized;
            lastFetch = Date.now();

            // Update UI
            UIManager.updateBalance("hive", balances.HBD);
            UIManager.updateBalance("swaphive", swapHiveBalance);
            if (!silent) {
                UIManager.hideLoading();
                if (engineWarning) UIManager.showError(engineWarning);
            }

            // Trigger swap validation to enable/disable button based on current state
            SwapManager.validateButton();

            // Update swap history
            UIManager.updateSwapHistory();

            console.log(`✅ Balance loaded: HBD=${balances.HBD}, SWAP.HBD=${swapHiveBalance}`);
            return balances;

        } catch (error) {
            const handled = Utils.handleError(error, 'WalletManager.loadBalance');
            if (!silent) {
                UIManager.hideLoading();
                UIManager.showError(handled.message);
            }

            // Switching to a different account failed: drop the old
            // account rather than keep its balances on screen next to
            // the new name (a swap would have been signed by the old
            // one). A failed refresh of the SAME account keeps its
            // last balances - that is just a node hiccup.
            if (currentUser && switching) {
                clearWallet();
                UIManager.updateBalance("hive", 0);
                UIManager.updateBalance("swaphive", 0);
                UIManager.updateSwapHistory();
            }
            SwapManager.validateButton();
            return null;
        }
    }

    /**
     * Get current user
     */
    function getCurrentUser() {
        return currentUser;
    }

    /**
     * Get current balances
     */
    function getBalances() {
        return Utils.deepClone(balances);
    }

    /**
     * Get specific balance
     */
    function getBalance(symbol) {
        return balances[symbol] || 0;
    }

    /**
     * Update balance after swap
     */
    function updateBalance(symbol, amount) {
        if (balances.hasOwnProperty(symbol)) {
            const newAmount = Utils.floorTo(amount, 3);
            balances[symbol] = newAmount;
            const id = symbol === "HBD" ? "hive" : "swaphive";
            UIManager.updateBalance(id, newAmount);
        }
    }
    
    /**
     * Refresh balance (force reload, bypass cache)
     */
    async function refreshBalance(options = {}) {
        if (!currentUser) {
            if (!options.silent) UIManager.showError("No user loaded");
            return null;
        }
        console.log("🔄 Force refreshing balance...");
        lastFetch = null; // Clear cache
        return await loadBalance(currentUser, true, options); // Force refresh
    }
    
    /**
     * Clear current user and balances
     */
    function clearWallet() {
        currentUser = null;
        balances = { HBD: 0, "SWAP.HBD": 0 };
        lastFetch = null;
    }

    // Public API
    return {
        loadBalance,
        getCurrentUser,
        getBalances,
        getBalance,
        updateBalance,
        refreshBalance,
        clearWallet
    };
})();
