const CACHE = 'kazu-beat-fx-v4.1.0';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css?v=4.1.0',
  './app.js?v=4.1.0',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './kazu-wave-motion.mp4'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

async function cachedRangeResponse(request) {
  const cached = await caches.match(new URL(request.url).pathname.endsWith('kazu-wave-motion.mp4')
    ? './kazu-wave-motion.mp4'
    : request.url);
  if (!cached) return fetch(request);
  const range = request.headers.get('range');
  if (!range) return cached;
  const data = await cached.arrayBuffer();
  const match = /bytes=(\d+)-(\d*)/.exec(range);
  if (!match) return cached;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : data.byteLength - 1;
  return new Response(data.slice(start, end + 1), {
    status: 206,
    statusText: 'Partial Content',
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Range': `bytes ${start}-${end}/${data.byteLength}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': String(end - start + 1)
    }
  });
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.headers.has('range')) {
    event.respondWith(fetch(event.request).catch(() => cachedRangeResponse(event.request)));
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
