/* SCI PWA — cache offline de los archivos de la app */
const CACHE = 'sci-v18';
const APP_FILES = [
  './',
  './index.html',
  './css/styles.css',
  './data/presupuesto-data.js',
  './js/core.js',
  './js/inventario.js',
  './js/huerto.js',
  './js/cuaderno.js',
  './js/presupuesto.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Firebase/Google y peticiones no-GET: siempre red (la app ya maneja su offline con IndexedDB)
  if (e.request.method !== 'GET' || url.hostname.includes('googleapis') ||
      url.hostname.includes('gstatic') || url.hostname.includes('firebase')) return;
  // Archivos propios y CDNs: red primero, caché como respaldo (offline)
  e.respondWith(
    fetch(e.request).then(resp => {
      const copy = resp.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return resp;
    }).catch(() => caches.match(e.request, {ignoreSearch:true})
      .then(r => r || caches.match('./index.html')))
  );
});
