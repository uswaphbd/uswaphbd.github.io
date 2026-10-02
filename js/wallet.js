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
        const ssc = APIManager.getSSC();
        if (!ssc) {
            return Promise.reject(new Utils.APIError('Hive Engine API not initialized'));
        }

        // Promise form only - passing a callback makes sscjs fire the request
        // twice (see the note in market.js queryHiveEngine). This runs on every
        // balance load, including the 30s auto-refresh, so it doubled up often.
        return ssc.find(contract, table, query, limit, 0, [])
            .then(result => result || [])
            .catch(error => {
                throw new Utils.APIError(error.message || 'Query failed');
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
        const tokens = await Utils.retry(() =>
            queryHiveEngine('tokens', 'balances', { 
                account: username, 
                symbol: 'SWAP.HBD' 
            }),
            3, 1000
        );

        const swapHiveBalance = tokens && tokens.length > 0 
            ? Utils.parseNumber(tokens[0].balance, 0)
            : 0;

        return Utils.floorTo(swapHiveBalance, 3);
    }

    /**
     * Load user balances from Hive and Hive Engine
     * With debouncing to prevent rapid API calls
     */
    async function loadBalance(username, forceRefresh = false) {
        // Validate username
        const sanitized = Utils.sanitizeUsername(username);
        if (!Utils.isValidUsername(sanitized)) {
            UIManager.showError("Invalid username format");
            return null;
        }

        // Check cache (skip if force refresh)
        const now = Date.now();
        if (!forceRefresh && currentUser === sanitized && lastFetch && (now - lastFetch) < CACHE_DURATION) {
            console.log(`⚡ Using cached balance (${Math.floor((CACHE_DURATION - (now - lastFetch)) / 1000)}s remaining)`);
            return balances;
        }

        // Debounce: Clear previous timeout
        if (loadBalanceTimeout) {
            clearTimeout(loadBalanceTimeout);
        }

        // Return promise that resolves after debounce
        return new Promise((resolve) => {
            loadBalanceTimeout = setTimeout(async () => {
                try {
                    UIManager.showLoading("Loading balances...");
                    
                    console.log(`🔄 Fetching fresh balance for @${sanitized}...`);
                    
                    // Fetch both balances in parallel
                    const [hiveBalance, swapHiveBalance] = await Promise.all([
                        fetchHiveBalance(sanitized),
                        fetchSwapHiveBalance(sanitized)
                    ]);

                    // Update state
                    balances.HBD = hiveBalance;
                    balances["SWAP.HBD"] = swapHiveBalance;
                    currentUser = sanitized;
                    lastFetch = Date.now();

                    // Update UI
                    UIManager.updateBalance("hive", hiveBalance);
                    UIManager.updateBalance("swaphive", swapHiveBalance);
                    UIManager.hideLoading();
                    
                    // Trigger swap validation to enable/disable button based on current state
                    SwapManager.validateButton();
                    
                    // Update swap history
                    UIManager.updateSwapHistory();

                    console.log(`✅ Balance loaded: HBD=${hiveBalance}, SWAP.HBD=${swapHiveBalance}`);
                    resolve(balances);

                } catch (error) {
                    const handled = Utils.handleError(error, 'WalletManager.loadBalance');
                    UIManager.hideLoading();
                    UIManager.showError(handled.message);
                    resolve(null);
                }
            }, 500); // 500ms debounce delay
        });
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
    async function refreshBalance() {
        if (!currentUser) {
            UIManager.showError("No user loaded");
            return null;
        }
        console.log("🔄 Force refreshing balance...");
        lastFetch = null; // Clear cache
        return await loadBalance(currentUser, true); // Force refresh
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
