const CACHE_NAME = 'aegislink-shell-v2';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/icon.svg',
  '/icon-maskable.svg',
  '/offline.html',
];

async function collectBuildAssets() {
  const response = await fetch('/index.html', { cache: 'no-store' });
  const html = await response.text();
  const assetMatches = html.match(/(?:src|href)="(\/assets\/[^"]+)"/g) || [];
  const assetUrls = assetMatches
    .map((match) => match.match(/"(.*?)"/)?.[1])
    .filter(Boolean);

  return Array.from(new Set([...CORE_ASSETS, ...assetUrls]));
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const assets = await collectBuildAssets();
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(assets);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', clone));
          return response;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          return (await cache.match('/index.html')) || (await cache.match('/offline.html'));
        }),
    );
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const networkFetch = fetch(request)
          .then((response) => {
            if (response.ok) {
              caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
            }
            return response;
          })
          .catch(() => cached);

        return cached || networkFetch || caches.match('/offline.html');
      }),
    );
  }
});
