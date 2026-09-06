// Cache name is versioned with a build timestamp so every new deploy of this
// file automatically invalidates old caches — no manual bumping needed.
const CACHE_VERSION = '2026-09-06-1';
const CACHE_NAME = 'mahamy-cache-' + CACHE_VERSION;

// Files that make up the app shell itself. These change on every deploy,
// so they must ALWAYS be fetched from the network first (network-first).
// The cache is only a fallback for when the device is offline.
const APP_SHELL = ['./', './index.html', './manifest.json'];

// Files that rarely/never change. Safe to serve from cache instantly
// (cache-first) since re-fetching them on every load wastes time for
// no benefit — falls back to network if not yet cached.
const STATIC_ASSETS = ['./icon-192.png', './icon-512.png'];

const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Tajawal:wght@700;800;900&display=swap';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll([...APP_SHELL, ...STATIC_ASSETS]).then(() => {
        // Proactively fetch and cache the font stylesheet + the font files it references,
        // so the exact same font renders identically on every future load, even offline.
        return fetch(FONT_CSS_URL, { mode: 'cors' }).then((cssResp) => {
          if (!cssResp || !cssResp.ok) return;
          cache.put(FONT_CSS_URL, cssResp.clone());
          return cssResp.text().then((cssText) => {
            const fontUrls = Array.from(cssText.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)).map(m => m[1]);
            return Promise.all(fontUrls.map((url) =>
              fetch(url, { mode: 'cors' }).then((r) => { if (r && r.ok) cache.put(url, r); }).catch(()=>{})
            ));
          });
        }).catch(()=>{});
      });
    }).catch(()=>{})
  );
  // Activate this new service worker immediately instead of waiting for
  // all open tabs of the old version to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  // Take control of any already-open tabs right away.
  self.clients.claim();
});

function isAppShellRequest(request) {
  if (request.mode === 'navigate') return true;
  const url = new URL(request.url);
  return url.origin === self.location.origin &&
    (url.pathname.endsWith('/') || url.pathname.endsWith('index.html') || url.pathname.endsWith('manifest.json'));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  if (isAppShellRequest(request)) {
    // NETWORK-FIRST: always try to get the latest deploy. Only fall back
    // to the cached copy if the network is unavailable (offline).
    event.respondWith(
      fetch(request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  // CACHE-FIRST: static assets (icons, fonts) rarely change, so serve
  // instantly from cache and only hit the network the first time.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        const cacheable = response && (response.status === 200 || response.type === 'opaque');
        if (cacheable) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }).catch(() => cached);
    })
  );
});
