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
     * Fetch the HBD price.
     *
     * Derived from the Hive internal market, as the original HBD app did:
     * HBD/USD = HIVE/USD divided by the mid of the HIVE<->HBD ticker
     * (HBD per HIVE). CoinGecko's hive_dollar quote was seen ~2% off the
     * internal market (e.g. $1.019 vs ~$0.998), which on an HBD bridge makes
     * HBD look mispriced - so CoinGecko is only the fallback here.
     */
    async function fetchHBDPrice() {
        try {
            const hivePrice = prices.hive > 0 ? prices.hive : await fetchHivePrice();
            const ticker = await APIManager.tryWithFailover(() => hive.api.getTickerAsync());
            const bid = Utils.parseNumber(ticker && ticker.highest_bid, 0);
            const ask = Utils.parseNumber(ticker && ticker.lowest_ask, 0);
            const mid = (bid + ask) / 2;

            if (hivePrice > 0 && mid > 0) {
                prices.hbd = Utils.roundTo(hivePrice / mid, 4);
                UIManager.updatePrice("hbdusdprice", prices.hbd);
                return prices.hbd;
            }
            throw new Utils.APIError('Internal market price unavailable');
        } catch (error) {
            console.warn('HBD price from the internal market failed, using CoinGecko:', error.message);
        }

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
            // HIVE first - the HBD price is derived from it
            await fetchHivePrice();
            await fetchHBDPrice();

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
            
            // Fetch both in parallel. Each side is applied on its own, so a
            // Hive Engine outage no longer stops the HBD pool updating (or
            // the other way round); a side that failed keeps its last value.
            const [accountsResult, tokensResult] = await Promise.allSettled([
                APIManager.tryWithFailover(() =>
                    hive.api.getAccountsAsync([CONFIG.BRIDGE_USER])
                ),
                queryHiveEngine('tokens', 'balances', {
                    account: CONFIG.BRIDGE_USER,
                    symbol: 'SWAP.HBD'
                })
            ]);

            const accounts = accountsResult.status === 'fulfilled' ? accountsResult.value : null;
            const tokens = tokensResult.status === 'fulfilled' ? tokensResult.value : null;

            // Update HBD liquidity
            if (accounts && accounts.length > 0) {
                liquidity.hive = Utils.parseNumber(accounts[0].hbd_balance, 0);
                UIManager.updateLiquidity("hiveliquidity", liquidity.hive);
            }

            // Update SWAP.HBD liquidity (no balance row = the bridge holds none)
            if (tokens) {
                liquidity.swapHive = tokens.length > 0 ? Utils.parseNumber(tokens[0].balance, 0) : 0;
                UIManager.updateLiquidity("swaphiveliquidity", liquidity.swapHive);
            }

            if (!accounts || !tokens) {
                const failed = [!accounts && 'HBD', !tokens && 'SWAP.HBD'].filter(Boolean).join(' and ');
                throw new Utils.APIError('Could not refresh the bridge ' + failed + ' balance');
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
