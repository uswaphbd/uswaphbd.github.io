/**
 * Service Worker
 *
 * The version is NOT defined here - js/config.js is the single source of truth.
 * It is imported below so that bumping CONFIG.FRONTEND_VERSION is the only edit
 * needed to evict the old cache and deliver a new build to returning visitors.
 */
let CACHE_VERSION = "0.0.0"; // fallback only, if config.js cannot be loaded

try {
    importScripts("/js/config.js");
    if (typeof CONFIG !== "undefined" && CONFIG.FRONTEND_VERSION) {
        CACHE_VERSION = CONFIG.FRONTEND_VERSION;
    }
} catch (error) {
    // Never let a config problem stop the worker from installing - it just
    // falls back to the placeholder version above.
    console.error("sw.js: could not load /js/config.js for the version", error);
}

const CACHE_NAME = `swap-hbd-v${CACHE_VERSION}`;

const assets = [
  "/",
  "/index.html",
  "/css/modern-dark.css",
  "/js/utils.js",
  "/js/config.js",
  "/js/api.js",
  "/js/apiManager.js",
  "/js/hiveauth.js",
  "/js/wallet.js",
  "/js/market.js",
  "/js/bridgeHistory.js",
  "/js/swap.js",
  "/js/ui.js",
  "/js/main.js",
  "/assets/hive_auth.png",
  "/assets/hive_keychain.png",
  "/assets/hiveupme.png",
];

self.addEventListener("install", (installEvent) => {
  installEvent.waitUntil(
    caches
      .open(CACHE_NAME)
      // addAll() rejects the whole install if any single file 404s; tolerate that
      .then((cache) => Promise.allSettled(assets.map((a) => cache.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (activateEvent) => {
  activateEvent.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("swap-hbd") && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (fetchEvent) => {
  const request = fetchEvent.request;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Never cache API traffic (Hive nodes, Hive Engine, CoinGecko, fee.json) -
  // stale balances or a stale fee config would be actively harmful.
  if (url.origin !== self.location.origin) return;

  // Network-first for app code and pages so a new deploy is picked up straight
  // away, with the cache as an offline fallback. The previous cache-first
  // strategy meant returning visitors kept the old build indefinitely.
  fetchEvent.respondWith(
    fetch(request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("/index.html")))
  );
});
