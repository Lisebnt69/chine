// Cache offline. Réseau d'abord pour la page et les scripts (pour recevoir les mises à jour),
// cache en secours quand il n'y a pas de réseau.
const CACHE_NAME = 'chine-app-v6';
const ASSETS = ['./', './index.html', './ia.js', './icons.js', './fonts/GeneralSans-500.woff2', './fonts/GeneralSans-600.woff2', './fonts/GeneralSans-700.woff2', './cerveau.json', './manifest.webmanifest'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Supabase / OSM / API : jamais de cache
  if (url.origin !== self.location.origin && !/unpkg|jsdelivr|fonts\.g/.test(url.host)) return;
  event.respondWith(
    fetch(req).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {}); }
      return response;
    }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
  );
});
