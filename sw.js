const CACHE_NAME = 'netballstats-v38';
const ASSETS = [
  './',
  './index.html',
  './live.html',
  './dashboard.html',
  './css/style.css',
  './css/live-kinetic.css',
  './css/dash-kinetic.css',
  './js/app.js',
  './js/firebase.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/hatfield.jpg'
];

// Install - cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate - clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch - network first, fall back to cache (so updates always show)
// Skip caching for non-GET requests (Firebase uses POST)
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
