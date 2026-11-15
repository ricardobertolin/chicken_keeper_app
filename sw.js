// Bumping VERSION is what evicts the previous cache in `activate`. It had been
// pinned at v0.8.3 across every release since, so the old entry was never
// purged and returning visitors kept getting that build served to them.
const VERSION = 'chicken-keeper-v0.9.4';

// Only files index.html actually references. styles.css / app.js /
// manifest.webmanifest / icon.svg are unused stubs and were being precached
// for nothing.
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './wolf-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// The whole game is one HTML file, so treating it like a static asset meant a
// cache hit pinned the player to whatever build they first loaded — a new
// deploy could never reach them. HTML is therefore network-first (fall back to
// the cache only when offline); everything else stays cache-first for speed.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Always load the deployed TURN settings. Do not retain credentials offline.
  const url = new URL(req.url);
  const multiplayerConfig = new URL('./multiplayer-config.json', self.location.href);
  if (url.origin === multiplayerConfig.origin && url.pathname === multiplayerConfig.pathname) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  const wantsHTML = req.mode === 'navigate' ||
                    (req.headers.get('accept') || '').includes('text/html');

  if (wantsHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === 'basic') {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy));
          }
          return res;
        })
        .catch(() => cached || caches.match('./index.html'));
      return cached || network;
    })
  );
});
