/**
 * Bridge History Module
 * Ported from uswapapp's historyReader()/getHistory() chain.
 *
 * Shows the last 3 outgoing HBD transfers and last 3 outgoing SWAP.HBD
 * transfers made BY THE BRIDGE ACCOUNT (@uswap) - i.e. the most recent
 * payouts to *any* user, bridge-wide. This is deliberately separate from
 * SwapManager's "My Recent Swaps" panel, which tracks only the current
 * user's own swaps. Both are kept, per product decision.
 */
const BridgeHistoryManager = (function() {
    const ENTRIES_PER_TYPE = 3;
    const HISTORY_LOOKBACK = 50; // account-history ops to scan per fetch
    const CACHE_DURATION = 60000; // 60 seconds

    let cache = {
        hive: [],
        swapHive: [],
        lastFetch: null
    };

    /**
     * Hive account-history timestamps are UTC with no timezone suffix
     */
    function toTimestamp(time) {
        return new Date(time + '.000Z').getTime();
    }

    /**
     * Pull raw outgoing transfers from the bridge account's history and
     * split/sort/trim them into the two lists the UI shows.
     */
    async function fetchRawHistory() {
        const history = await APIManager.tryWithFailover(() =>
            hive.api.getAccountHistoryAsync(CONFIG.BRIDGE_USER, -1, HISTORY_LOOKBACK)
        );

        const hiveEntries = [];
        const swapHiveEntries = [];

        (history || []).forEach((item) => {
            const op = item[1]?.op;
            if (!op) return;

            const [opType, opValue] = op;
            const trxId = item[1].trx_id;
            const time = item[1].timestamp;

            // Outgoing HBD payout from the bridge (excludes internal transfers to uswap.app)
            if (opType === 'transfer' && opValue.from === CONFIG.BRIDGE_USER && opValue.to !== 'uswap.app') {
                hiveEntries.push({
                    to: opValue.to,
                    amount: Utils.parseNumber(String(opValue.amount).replace('HBD', '').trim(), 0),
                    trx: trxId,
                    timestamp: toTimestamp(time)
                });
                return;
            }

            // Outgoing SWAP.HBD payout from the bridge, via Hive Engine custom_json
            if (opType === 'custom_json' && opValue.id === 'ssc-mainnet-hive') {
                try {
                    const json = JSON.parse(opValue.json);
                    if (json.contractName === 'tokens' &&
                        json.contractAction === 'transfer' &&
                        json.contractPayload &&
                        json.contractPayload.symbol === 'SWAP.HBD' &&
                        json.contractPayload.to !== 'uswap.app') {
                        swapHiveEntries.push({
                            to: json.contractPayload.to,
                            amount: Utils.parseNumber(json.contractPayload.quantity, 0),
                            trx: trxId,
                            timestamp: toTimestamp(time)
                        });
                    }
                } catch (error) {
                    // Malformed/unrelated custom_json payload - ignore
                }
            }
        });

        hiveEntries.sort((a, b) => b.timestamp - a.timestamp);
        swapHiveEntries.sort((a, b) => b.timestamp - a.timestamp);

        return {
            hive: hiveEntries.slice(0, ENTRIES_PER_TYPE),
            swapHive: swapHiveEntries.slice(0, ENTRIES_PER_TYPE)
        };
    }

    /**
     * Fetch (with caching) and push the result to the UI
     */
    async function fetchHistory(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && cache.lastFetch && (now - cache.lastFetch) < CACHE_DURATION) {
            UIManager.updateBridgeHistory(cache.hive, cache.swapHive);
            return cache;
        }

        try {
            const result = await fetchRawHistory();
            cache = { hive: result.hive, swapHive: result.swapHive, lastFetch: now };
            UIManager.updateBridgeHistory(cache.hive, cache.swapHive);
        } catch (error) {
            const handled = Utils.handleError(error, 'BridgeHistoryManager.fetchHistory');
            console.error(handled.message);
            // Non-fatal: leave whatever was last rendered (or nothing) in place
        }

        return cache;
    }

    /**
     * Initialize: fetch once at startup. Deliberately not awaited by
     * main.js - this is supplementary and must never delay the swap UI.
     */
    async function initialize() {
        await fetchHistory();
        console.log("Bridge History Manager initialized");
    }

    // Public API
    return {
        initialize,
        fetchHistory
    };
})();
