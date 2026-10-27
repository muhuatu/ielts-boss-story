// Offline support. VERSION must match the ?v= in index.html; run tools/bump_version.py to change both.
const VERSION = '20261027-6';
const CACHE = 'ielts-boss-story-' + VERSION;
const ASSETS = [
  './', './index.html', './manifest.webmanifest',
  `./style.css?v=${VERSION}`, `./app.js?v=${VERSION}`,
  `./data/stories.json?v=${VERSION}`, `./data/dict.json?v=${VERSION}`,
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // pages: network first so a new version shows up as soon as it is online; cached copy when offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  // versioned assets never change, so the cache can answer first
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
    return res;
  })));
});
