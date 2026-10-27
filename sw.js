// Offline support. Bump CACHE_VERSION whenever you change any file listed in ASSETS.
const CACHE_VERSION = 'v1';
const CACHE = `flashcards-${CACHE_VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/db.js',
  './js/csv.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('flashcards-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Serve from cache straight away (fast, works offline) and refresh the cache in the background,
// so an update you push to GitHub shows up the next time the app is opened.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(caches.open(CACHE).then(async (cache) => {
    const cached = await cache.match(request, { ignoreSearch: true });
    const refresh = fetch(request)
      .then((response) => { if (response.ok) cache.put(request, response.clone()); return response; })
      .catch(() => cached);
    return cached || refresh;
  }));
});
