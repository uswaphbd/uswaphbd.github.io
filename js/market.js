/**
 * Market Module
 * Handles market price fetching and liquidity pool information with retry logic
 */

const MarketManager = (function() {
    let prices = {
        hive: 0,
        hbd: 0
    };

    let liquidity = {
        hive: 0,
        swapHive: 0
    };
    
    // Price cache
    let priceCache = {
        lastFetch: null,
        cacheDuration: 60000 // 60 seconds (increased from 15)
    };
    
    // Liquidity cache
    let liquidityCache = {
        lastFetch: null,
        cacheDuration: 45000 // 45 seconds
    };

    /**
     * Query Hive Engine with Promise wrapper
     */
    function queryHiveEngine(contract, table, query, limit = 1) {
        const ssc = APIManager.getSSC();
        if (!ssc) {
            return Promise.reject(new Utils.APIError('Hive Engine API not initialized'));
        }

        // Promise form only - do NOT pass a callback. sscjs's send() is
        //   send(url, req, cb) { return cb && this.sendWithCallback(...), this.sendWithPromise(...) }
        // so passing a callback fires TWO identical HTTP requests and leaves the
        // second promise unhandled (surfacing as "Uncaught (in promise)
        // AxiosError" when a node is slow). Omitting it halves Engine traffic.
        return ssc.find(contract, table, query, limit, 0, [])
            .then(result => result || [])
            .catch(error => {
                throw new Utils.APIError(error.message || 'Query failed');
            });
    }

    /**
     * Fetch from CoinGecko with timeout
     */
    async function fetchCoinGecko(url) {
        try {
            const response = await Utils.withTimeout(
                axios.get(url),
                5000 // 5 second timeout
            );
            return response.data;
        } catch (error) {
            throw new Utils.APIError(`Failed to fetch from CoinGecko: ${error.message}`, url);
        }
    }

    /**
     * Fetch HIVE price from CoinGecko
     */
    async function fetchHivePrice() {
        try {
            const data = await Utils.retry(() => 
                fetchCoinGecko(CONFIG.COINGECKO_HIVE_URL),
                2, 1000
            );
            
            if (data && data.hive && data.hive.usd) {
                prices.hive = Utils.roundTo(data.hive.usd, 4);
                UIManager.updatePrice("hiveusdprice", prices.hive);
                return prices.hive;
            }
        } catch (error) {
            const handled = Utils.handleError(error, 'MarketManager.fetchHivePrice');
            console.error(handled.message);
        }
        return 0;
    }

    /**
     * Fetch HBD price from CoinGecko
     */
    async function fetchHBDPrice() {
        try {
            const data = await Utils.retry(() =>
                fetchCoinGecko(CONFIG.COINGECKO_HBD_URL),
                2, 1000
            );
            
            if (data && data.hive_dollar && data.hive_dollar.usd) {
                prices.hbd = Utils.roundTo(data.hive_dollar.usd, 4);
                UIManager.updatePrice("hbdusdprice", prices.hbd);
                return prices.hbd;
            }
        } catch (error) {
            const handled = Utils.handleError(error, 'MarketManager.fetchHBDPrice');
            console.error(handled.message);
        }
        return 0;
    }

    /**
     * Fetch all market prices (with caching)
     */
    async function fetchAllPrices(forceRefresh = false) {
        const now = Date.now();
        
        // Check cache
        if (!forceRefresh && priceCache.lastFetch && 
            (now - priceCache.lastFetch) < priceCache.cacheDuration) {
            console.log('Using cached market prices');
            return prices;
        }
        
        try {
            // Fetch in parallel for better performance
            await Promise.all([
                fetchHivePrice(),
                fetchHBDPrice()
            ]);

            priceCache.lastFetch = now;
            console.log("Market prices updated:", prices);
        } catch (error) {
            const handled = Utils.handleError(error, 'MarketManager.fetchAllPrices');
            console.error(handled.message);
        }
        
        return prices;
    }

    /**
     * Fetch liquidity pool balances (with caching)
     */
    async function fetchLiquidity(forceRefresh = false) {
        const now = Date.now();
        
        // Check cache
        if (!forceRefresh && liquidityCache.lastFetch && 
            (now - liquidityCache.lastFetch) < liquidityCache.cacheDuration) {
            console.log(`⚡ Using cached liquidity (${Math.floor((liquidityCache.cacheDuration - (now - liquidityCache.lastFetch)) / 1000)}s remaining)`);
            return liquidity;
        }
        
        try {
            console.log("🔄 Fetching fresh liquidity data...");
            
            // Fetch both in parallel
            const [accounts, tokens] = await Promise.all([
                APIManager.tryWithFailover(() => 
                    hive.api.getAccountsAsync([CONFIG.BRIDGE_USER])
                ),
                Utils.retry(() =>
                    queryHiveEngine('tokens', 'balances', { 
                        account: CONFIG.BRIDGE_USER, 
                        symbol: 'SWAP.HBD' 
                    }),
                    2, 1000
                )
            ]);

            // Update HBD liquidity
            if (accounts && accounts.length > 0) {
                liquidity.hive = Utils.parseNumber(accounts[0].hbd_balance, 0);
                UIManager.updateLiquidity("hiveliquidity", liquidity.hive);
            }

            // Update SWAP.HBD liquidity
            if (tokens && tokens.length > 0) {
                liquidity.swapHive = Utils.parseNumber(tokens[0].balance, 0);
                UIManager.updateLiquidity("swaphiveliquidity", liquidity.swapHive);
            }

            liquidityCache.lastFetch = now;
            console.log("✅ Liquidity updated:", liquidity);
        } catch (error) {
            const handled = Utils.handleError(error, 'MarketManager.fetchLiquidity');
            console.error(handled.message);
        }
        
        return liquidity;
    }

    /**
     * Get current prices
     */
    function getPrices() {
        return Utils.deepClone(prices);
    }

    /**
     * Get current liquidity
     */
    function getLiquidity() {
        return Utils.deepClone(liquidity);
    }

    /**
     * Initialize market module
     */
    async function initialize() {
        await fetchAllPrices();
        await fetchLiquidity();
        console.log("Market Manager initialized");
    }

    // Public API
    return {
        initialize,
        fetchAllPrices,
        fetchLiquidity,
        getPrices,
        getLiquidity,
        fetchHivePrice,
        fetchHBDPrice
    };
})();
