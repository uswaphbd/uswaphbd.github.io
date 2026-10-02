/**
 * API Management Module
 * Handles Hive and Hive Engine API node selection and management
 */

const APIManager = (function() {
    let ssc = null;
    let selectedHiveNode = null;
    let selectedEngineNode = null;

    /**
     * Get selected Hive endpoint from localStorage or default
     */
    /**
     * Resolve a saved endpoint, discarding it if it is no longer a node we
     * know about.
     *
     * Nodes die between visits - anyx.io (502) and engine.rishipanthee.com
     * (DNS gone) both did. Without this check a returning visitor keeps
     * starting every session on a dead node that has since been removed from
     * the shipped list. That matters most for Hive Engine, which has no
     * automatic failover (tryWithFailover only covers Hive), so a dead saved
     * Engine node breaks balances, liquidity and swap verification outright.
     *
     * A node the user added themselves is always kept.
     */
    function resolveEndpoint(storageKey, customKey, knownNodes, fallback) {
        const saved = localStorage.getItem(storageKey);
        if (!saved) return fallback;

        let custom = [];
        try {
            custom = JSON.parse(localStorage.getItem(customKey) || '[]');
        } catch (error) {
            custom = [];
        }

        if (knownNodes.indexOf(saved) !== -1 || custom.indexOf(saved) !== -1) {
            return saved;
        }

        console.warn('Saved endpoint ' + saved + ' is no longer a known node - falling back to ' + fallback);
        try {
            localStorage.setItem(storageKey, fallback);
        } catch (error) {
            /* storage unavailable - still use the fallback for this session */
        }
        return fallback;
    }

    async function getSelectedEndpoint() {
        return resolveEndpoint(
            'selectedEndpoint', 'customHiveNodes',
            CONFIG.HIVE_RPC_NODES, CONFIG.DEFAULT_HIVE_ENDPOINT
        );
    }

    /**
     * Get selected Engine endpoint from localStorage or default
     */
    async function getSelectedEngEndpoint() {
        return resolveEndpoint(
            'selectedEngEndpoint', 'customEngineNodes',
            CONFIG.ENGINE_RPC_NODES, CONFIG.DEFAULT_ENGINE_ENDPOINT
        );
    }

    /**
     * Initialize Hive API with selected node
     */
    async function initializeHiveAPI() {
        selectedHiveNode = await getSelectedEndpoint();
        console.log("SELECTED HIVE API NODE:", selectedHiveNode);
        
        // Set options with timeout
        hive.api.setOptions({ 
            url: selectedHiveNode,
            timeout: 8000, // 8 second timeout
            failover_threshold: 3,
            rebroadcast_threshold: 3
        });
        
        const button = document.getElementById("popup-button-hive");
        if (button) {
            button.value = selectedHiveNode;
            button.innerHTML = selectedHiveNode;
        }
        
        return selectedHiveNode;
    }

    /**
     * Initialize Hive Engine API with selected node
     */
    async function initializeEngineAPI() {
        selectedEngineNode = await getSelectedEngEndpoint();
        console.log("SELECTED ENGINE API NODE:", selectedEngineNode);
        
        // Check if SSC is available before initializing
        if (typeof SSC === 'undefined') {
            console.error('SSC library not loaded!');
            throw new Error('SSC library is not available');
        }
        
        ssc = new SSC(selectedEngineNode);
        
        const button = document.getElementById("popup-button-engine");
        if (button) {
            button.value = selectedEngineNode;
            button.innerHTML = selectedEngineNode;
        }
        
        return selectedEngineNode;
    }

    /**
     * Initialize all API configurations
     */
    async function initialize() {
        try {
            // Set alternative API endpoints for Hive
            hive.config.set('alternative_api_endpoints', CONFIG.HIVE_RPC_NODES);
            
            // Initialize both APIs
            await initializeHiveAPI();
            await initializeEngineAPI();

            // NOTE: the node-selector popups are wired by UIManager
            // (toggleAPIPanel/renderAPIList), which is the richer implementation -
            // it supports adding/removing custom nodes and sorts by status.
            // This module used to wire the same buttons as well; because it set
            // `button.disabled = true` mid-dispatch it suppressed UIManager's
            // handler, so the custom-node UI never appeared, and it left a
            // 60s setInterval re-running 13 health checks while the panel was open.

            console.log("✅ API Manager initialized successfully");
            console.log("📡 Hive Node:", selectedHiveNode);
            console.log("🔗 Engine Node:", selectedEngineNode);
        } catch (error) {
            console.error("❌ Error initializing API Manager:", error);
            throw error;
        }
    }

    /**
     * Try API call with automatic node failover
     */
    async function tryWithFailover(apiFn, maxAttempts = 3) {
        const availableNodes = CONFIG.HIVE_RPC_NODES.filter(node => node !== selectedHiveNode);
        let currentNode = selectedHiveNode;
        let lastError;
        
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                // Set current node
                hive.api.setOptions({ 
                    url: currentNode,
                    timeout: 8000
                });
                
                // Try the API call with timeout
                const result = await Utils.withTimeout(apiFn(), 10000);
                
                // If successful and we switched nodes, save the new node
                if (currentNode !== selectedHiveNode) {
                    console.log(`✅ Switched to working node: ${currentNode}`);
                    selectedHiveNode = currentNode;
                    localStorage.setItem('selectedEndpoint', currentNode);
                }
                
                return result;
            } catch (error) {
                lastError = error;
                console.warn(`⚠️ Node ${currentNode} failed (attempt ${attempt + 1}/${maxAttempts}):`, error.message);
                
                // Try next node if available
                if (attempt < maxAttempts - 1 && availableNodes.length > 0) {
                    currentNode = availableNodes[attempt % availableNodes.length];
                    console.log(`🔄 Switching to backup node: ${currentNode}`);
                    await Utils.sleep(500); // Brief delay before retry
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Get SSC instance
     */
    function getSSC() {
        return ssc;
    }

    // Public API
    return {
        initialize,
        getSSC,
        initializeHiveAPI,
        initializeEngineAPI,
        getSelectedEndpoint,
        getSelectedEngEndpoint,
        tryWithFailover
    };
})();
