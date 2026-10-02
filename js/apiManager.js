/**
 * API Manager Helper
 * Provides additional helper methods for managing custom API nodes
 * This wraps the core APIManager and adds node management functionality
 */

(function() {
    /**
     * Get custom nodes from localStorage
     */
    function getCustomNodes(type) {
        const key = `custom${type.charAt(0).toUpperCase() + type.slice(1)}Nodes`;
        return JSON.parse(localStorage.getItem(key) || '[]');
    }

    /**
     * Get all available API nodes for a type
     */
    function getAPIs(type) {
        const defaults = type === 'hive' ? CONFIG.HIVE_RPC_NODES : CONFIG.ENGINE_RPC_NODES;
        const custom = getCustomNodes(type);
        
        // Combine and deduplicate
        return [...new Set([...defaults, ...custom])];
    }

    /**
     * Check if a node URL is from the default list
     */
    function isDefault(type, url) {
        const defaults = type === 'hive' ? CONFIG.HIVE_RPC_NODES : CONFIG.ENGINE_RPC_NODES;
        return defaults.includes(url);
    }

    /**
     * Validate if URL is a Hive node by checking block info
     */
    async function validateHiveNode(url) {
        try {
            const response = await axios.post(url, {
                jsonrpc: '2.0',
                method: 'condenser_api.get_dynamic_global_properties',
                params: [],
                id: 1
            }, { timeout: 5000 });
            
            // Hive nodes return result with head_block_number, current_witness, etc.
            return response.data && response.data.result && 
                   response.data.result.head_block_number !== undefined;
        } catch (error) {
            return false;
        }
    }
    
    /**
     * Validate if URL is a Hive Engine node by checking contracts
     */
    async function validateEngineNode(url) {
        try {
            // First try to get blockchain info (lightweight check)
            const infoResponse = await axios.get(url, { timeout: 5000 });
            
            // Check if response has Hive Engine blockchain properties
            if (infoResponse.data && 
                (infoResponse.data.chainId === 'mainnet-hive' || 
                 infoResponse.data.lastBlockNumber !== undefined ||
                 infoResponse.data.SSCnodeVersion !== undefined)) {
                return true;
            }
            
            // Fallback: Try contracts endpoint
            const response = await axios.post(url + '/contracts', {
                jsonrpc: '2.0',
                method: 'find',
                params: {
                    contract: 'tokens',
                    table: 'tokens',
                    query: {},
                    limit: 1
                },
                id: 1
            }, { timeout: 5000 });
            
            // Hive Engine nodes return array result
            return response.data && Array.isArray(response.data);
        } catch (error) {
            return false;
        }
    }

    /**
     * Add a custom API node
     */
    async function addAPI(type, url) {
        if (!url || typeof url !== 'string') return false;
        
        // Validate URL format
        url = url.trim();
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            console.error('Invalid URL format');
            return { success: false, error: 'Invalid URL format' };
        }

        // Check if already exists
        const existing = getAPIs(type);
        if (existing.includes(url)) {
            console.log('API node already exists');
            return { success: false, error: 'Node already exists' };
        }

        // Validate by checking actual API response
        let isValid = false;
        if (type === 'hive') {
            isValid = await validateHiveNode(url);
            if (!isValid) {
                return { success: false, error: 'This is not a valid Hive API node' };
            }
        } else if (type === 'engine') {
            isValid = await validateEngineNode(url);
            if (!isValid) {
                return { success: false, error: 'This is not a valid Hive Engine API node' };
            }
        }

        // Add to custom nodes
        const customNodes = getCustomNodes(type);
        customNodes.push(url);
        localStorage.setItem(`custom${type.charAt(0).toUpperCase() + type.slice(1)}Nodes`, 
            JSON.stringify(customNodes));
        
        console.log(`Added custom ${type} node: ${url}`);
        return { success: true };
    }

    /**
     * Remove a custom API node
     */
    function removeAPI(type, url) {
        // Don't allow removing default nodes from the list entirely
        // Just remove from custom nodes
        const customNodes = getCustomNodes(type);
        const index = customNodes.indexOf(url);
        if (index > -1) {
            customNodes.splice(index, 1);
            localStorage.setItem(`custom${type.charAt(0).toUpperCase() + type.slice(1)}Nodes`, 
                JSON.stringify(customNodes));
            console.log(`Removed custom ${type} node: ${url}`);
        }
    }

    /**
     * Restore a default node (no-op since defaults are always present)
     */
    function restoreDefault(type, url) {
        // Defaults are always in the list, so this is a no-op
        console.log(`Default ${type} node ${url} is always available`);
    }

    /**
     * Get currently selected node
     */
    function getSelectedNode(type) {
        const key = type === 'hive' ? 'selectedEndpoint' : 'selectedEngEndpoint';
        return localStorage.getItem(key);
    }

    /**
     * Set selected node
     */
    function setSelectedNode(type, url) {
        const key = type === 'hive' ? 'selectedEndpoint' : 'selectedEngEndpoint';
        localStorage.setItem(key, url);
        
        // Update button display
        const buttonId = type === 'hive' ? 'popup-button-hive' : 'popup-button-engine';
        const button = document.getElementById(buttonId);
        if (button) {
            button.innerHTML = url;
        }
    }

    // Expose as global for UIManager
    window.apiManager = {
        getAPIs,
        isDefault,
        addAPI,
        removeAPI,
        restoreDefault,
        getSelectedNode,
        setSelectedNode
    };

    console.log('API Manager Helper initialized');
})();
