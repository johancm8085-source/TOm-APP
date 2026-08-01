// Service worker de TOM - Agenda de gastos
// Guarda una copia de la app en el celular para que funcione sin internet.
const CACHE_NAME = 'tom-cache-v6';
const ASSETS_TO_CACHE = [
  './', './index.html', './styles.css', './dragsort.js', './voice.js', './app.js', './stats.js', './mascot.js', './manifest.json',
  './icon-192.png', './icon-512.png', './logo-small.png', './luna-logo-small.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS_TO_CACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Estrategia: usar la copia guardada primero (rápido y funciona sin internet).
// Si hay internet, de paso actualiza la copia guardada por si subiste cambios nuevos.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchAndUpdate = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchAndUpdate;
    })
  );
});
