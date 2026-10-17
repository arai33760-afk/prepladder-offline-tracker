const CACHE_NAME = '__CACHE_NAME__';
const FILES = ['.', './index.html', './styles.css', './app.js', './core.js', './storage.js', './backup.js', './seed.json', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', event => {
  const requests = FILES.map(file => new Request(new URL(file, self.registration.scope), { cache: 'reload' }));
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(requests)).then(() => self.skipWaiting()));
});
async function refreshClient(client) {
  // New pages wait for pending saves. Legacy pages have no update listener.
  const acknowledged = await new Promise(resolve => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); resolve(false); }, 1500);
    channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(true); };
    client.postMessage({ type: 'TRACKER_UPDATE_READY' }, [channel.port2]);
  });
  // Do not await navigation during activation: its fetches need activation to finish.
  if (!acknowledged) client.navigate(client.url).catch(() => {});
}
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const oldCaches = (await caches.keys()).filter(key => key.startsWith('prepladder-') && key !== CACHE_NAME);
    await Promise.all(oldCaches.map(key => caches.delete(key)));
    await self.clients.claim();
    if (oldCaches.length) {
      const clients = await self.clients.matchAll({ type: 'window' });
      await Promise.allSettled(clients.filter(client => client.url.startsWith(self.registration.scope)).map(refreshClient));
    }
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  event.respondWith(caches.open(CACHE_NAME).then(cache => cache.match(request)).then(cached => cached || fetch(request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE_NAME).then(cache => cache.put(request, copy)); }
    return response;
  }).catch(() => request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
