// Funziona anche senza internet (la modalità contro il computer).
const CACHE = 'ciccio-e-tuk-v3';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/audio.js', 'js/art.js', 'js/net.js', 'js/game.js', 'js/main.js',
  'vendor/peerjs.min.js', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Prima la rete (così gli aggiornamenti arrivano subito), poi la copia salvata.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then(r => {
      const copy = r.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
