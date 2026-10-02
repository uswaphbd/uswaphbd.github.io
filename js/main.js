/**
 * Main Application Entry Point
 * Initializes all modules and starts the application
 */

(async function() {
    console.log("=".repeat(50));
    console.log("SWAP HIVE - Modern UI");
    console.log("Initializing application...");
    console.log("=".repeat(50));

    /**
     * Initialize application
     */
    async function initializeApp() {
        try {
            // Clear URL parameters
            window.history.replaceState({}, document.title, "/");

            // Initialize API Manager (must be first)
            console.log("⏳ Initializing API Manager...");
            await APIManager.initialize();
            console.log("✅ API Manager initialized");

            // Initialize Hive Auth (opens the HAS websocket eagerly; non-fatal if it fails)
            console.log("⏳ Initializing Hive Auth...");
            HiveAuthManager.initialize();
            console.log("✅ Hive Auth initialized");

            // Initialize Swap Manager (loads fee config)
            console.log("⏳ Initializing Swap Manager...");
            await SwapManager.initialize();
            console.log("✅ Swap Manager initialized");

            // Initialize UI Manager before the (slow) market fetch.
            // It only wires DOM handlers and depends on nothing MarketManager
            // produces, and the swap button stays disabled until validation
            // passes anyway. Doing it here means the node-selector popups are
            // usable within ~1s instead of ~14s - which matters most to the
            // user whose Hive node is timing out and who wants to switch it.
            console.log("⏳ Initializing UI Manager...");
            UIManager.initialize();
            console.log("✅ UI Manager initialized");

            // Initialize Market Manager (fetches liquidity, updates CONFIG pools)
            // IMPORTANT: Must complete before a swap can be validated
            console.log("⏳ Initializing Market Manager...");
            await MarketManager.initialize();
            console.log("✅ Market Manager initialized");

            // Bridge-wide history (last 3 HBD + last 3 SWAP.HBD payouts to anyone).
            // Deliberately not awaited: supplementary info that must never delay
            // the swap UI becoming usable. BridgeHistoryManager swallows its own errors.
            console.log("⏳ Loading bridge history...");
            BridgeHistoryManager.initialize();

            console.log("=".repeat(50));
            console.log("✅ Application initialized successfully!");
            console.log("=".repeat(50));

        } catch (error) {
            console.error("❌ Error initializing application:", error);
            alert("Failed to initialize application. Please refresh the page.");
        }
    }

    // Wait for DOM to be ready
    $(window).on("load", async function() {
        await initializeApp();
    });

    // jQuery ready function for backwards compatibility
    $(document).ready(function() {
        console.log("📄 DOM ready");
    });

})();
