/* SCI - Service Worker
   Reconstruido en v85 (el archivo anterior fue sobrescrito con el contenido
   de index.html y el SW no registraba). Estrategia: cache-first con
   precache versionado; la red actualiza el cache en segundo plano. */
 
const CACHE = 'sci-v85';
 
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css?v=85',
  './js/core.js?v=85',
  './js/inventario.js?v=85',
  './js/cuaderno.js?v=85',
  './js/huerto.js?v=85',
  './js/presupuesto.js?v=85',
  './js/ordencompra.js?v=85',
  './js/actualizacion.js?v=85',
  './data/presupuesto-data.js?v=85',
  './icons/icon-192.png',
  './icons/icon-512.png'
];
 
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});
 
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
 
self.addEventListener('fetch', e => {
  // Solo GET y mismo origen; Firebase/CDNs van directo a la red.
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;
 
  e.respondWith(
    caches.match(e.request).then(cached => {
      const fetched = fetch(e.request).then(resp => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return resp;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});
 
