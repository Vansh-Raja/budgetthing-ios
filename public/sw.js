/*
 * BudgetThing service worker — static app shell only.
 *
 * Cache policy (online-only finance app):
 * - Cached: same-origin GET requests for the static app shell — content-hashed JS/CSS
 *   under /_expo/static/, icons, fonts, the manifest — and the HTML shell for
 *   page loads (fallback only).
 * - Never cached: anything cross-origin (Convex, Clerk, the import HTTP API), any
 *   non-GET request, and any response that is not a plain 200. No financial data,
 *   auth/session material, or API response is ever written to a cache.
 * - Page loads are network-first, so a connected client always gets the
 *   current shell; the cached shell is only shown offline, where the app itself says
 *   "connection required" and allows no edits.
 *
 * BUILD_ID is stamped at export time (scripts/stamp-sw.mjs); a new build changes this
 * file, which makes the browser install a new worker and the app offer "Reload".
 */
const BUILD_ID = '__BUILD_ID__';
const CACHE = `budgetthing-shell-${BUILD_ID}`;
const SHELL_URL = '/';

// Precache the HTML shell AND the hashed JS/CSS it references, so an offline launch can
// render the app's own "connection required" state instead of a blank page.
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      const res = await fetch(SHELL_URL, { cache: 'no-cache' });
      if (!cacheable(res)) return;
      const html = await res.clone().text();
      await cache.put(SHELL_URL, res);
      const assets = Array.from(new Set(html.match(/\/_expo\/static\/[^"'\s)]+/g) || []));
      await cache.addAll(assets);
    })().catch(() => undefined)
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('budgetthing-shell-') && k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// The page asks a waiting worker to take over only when the user taps "Reload".
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith('/_expo/static/') ||
    url.pathname.startsWith('/assets/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/manifest.webmanifest' ||
    url.pathname === '/favicon.ico'
  );
}

function cacheable(response) {
  if (!response || response.status !== 200 || response.type !== 'basic') return false;
  // Respect the server's caching intent.
  return !/no-store/i.test(response.headers.get('Cache-Control') || '');
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Convex, Clerk, import API: always network

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (cacheable(response)) {
            const copy = response.clone();
            // Keep the worker alive until the write lands.
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(SHELL_URL, copy)));
          }
          return response;
        })
        .catch(() => caches.match(SHELL_URL).then((cached) => cached || Response.error()))
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            if (cacheable(response)) {
              const copy = response.clone();
              event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)));
            }
            return response;
          })
      )
    );
  }
  // Anything else same-origin: default network behaviour, not cached.
});
