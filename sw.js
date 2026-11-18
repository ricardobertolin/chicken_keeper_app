// Bumping VERSION is what evicts the previous cache in `activate`. It had been
// pinned at v0.8.3 across every release since, so the old entry was never
// purged and returning visitors kept getting that build served to them.
// Must match the version printed on the title screen (index.html, .menu-version)
// so a player's reported build maps to a known cache.
const VERSION = 'chicken-keeper-v0.16.6';

// Only files index.html actually references. app.js / manifest.webmanifest /
// icon.svg are unused stubs and are not precached. The game script is split
// into the js/ files below — bump VERSION whenever any of them changes, or
// returning players keep the cached build.
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './wolf-icon.png',
  './js/boot.js',
  './js/audio.js',
  './js/input.js',
  './js/state.js',
  './js/hints.js',
  './js/helpers.js',
  './js/upgrades.js',
  './js/spawning.js',
  './js/combat.js',
  './js/boss.js',
  './js/update.js',
  './js/render.js',
  './js/wolf-overlay.js',
  './js/debug-panel.js',
  './js/menu.js',
  './js/net.js',
  './js/ui.js',
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

// Treating the HTML like a static asset meant a cache hit pinned the player
// to whatever build they first loaded — a new deploy could never reach them.
// HTML is therefore network-first (fall back to
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
