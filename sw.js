// COMFY web (iPhone) – service worker: avvio anche senza connessione.
// - file dell'app (con ?v=versione): prima la cache, poi la rete; una nuova versione ha indirizzi nuovi;
// - pagina iniziale e version.json: prima la rete, se manca la connessione la copia salvata;
// - MediaPipe (jsdelivr) e modello del volto (storage.googleapis.com): salvati alla prima apertura online;
// - video: passano direttamente (Safari li chiede a pezzi).
const CACHE = 'comfy-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.endsWith('.mp4')) return;
  const sameOrigin = url.origin === self.location.origin;
  const external = /(^|\.)cdn\.jsdelivr\.net$|(^|\.)storage\.googleapis\.com$/.test(url.hostname);
  if (!sameOrigin && !external) return;
  const networkFirst = sameOrigin && (req.mode === 'navigate' || url.pathname.endsWith('/version.json') || url.pathname.endsWith('/'));
  if (networkFirst) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE), key = url.pathname.endsWith('/version.json') ? url.origin + url.pathname : req;
      try { const res = await fetch(req); if (res.ok) cache.put(key, res.clone()); return res; }
      catch (err) { const hit = await cache.match(key, { ignoreSearch: true }); if (hit) return hit; throw err; }
    })());
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE), hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req, res.clone());
    return res;
  })());
});
