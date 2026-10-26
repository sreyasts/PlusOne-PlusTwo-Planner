// HSS Planner Service Worker v7.1.0 (Original Brand Logo Restored)
const CACHE_NAME = 'hss-planner-v7.1.0';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon.png?v=7.1.0',
  './icon-192.png?v=7.1.0',
  './icon-512.png?v=7.1.0',
  './icon-maskable-192.png?v=7.1.0',
  './icon-maskable-512.png?v=7.1.0',
  './favicon-32.png?v=7.1.0',
  './apple-touch-icon.png?v=7.1.0'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Network-First for HTML/navigation requests so existing users always see new UI immediately!
// Cache-First for static assets (icons, etc.) for instant offline loading.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const isNavigation = (event.request.mode === 'navigate' || event.request.destination === 'document');

  if (isNavigation) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return networkResponse;
        })
        .catch(() => caches.match(event.request).then((res) => res || caches.match('./index.html')))
    );
    return;
  }

  // Static assets: cache first, update in background
  const assetUrl = new URL(event.request.url);
  const isAppBundle = assetUrl.origin === self.location.origin &&
    /\/assets\/[^/]+\.(?:js|css)$/.test(assetUrl.pathname);
  event.respondWith(
    // Built bundles are invariant bytes; preview servers can add Vary: Origin,
    // while install-time requests and module requests carry different origins.
    caches.match(event.request, { ignoreVary: isAppBundle }).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, networkResponse));
        }
        return networkResponse;
      }).catch(() => {});

      return cachedResponse || fetchPromise;
    })
  );
});
