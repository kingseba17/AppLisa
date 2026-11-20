// Service worker: guarda la app en el teléfono para que funcione sin internet
// y se actualice sola. NO toca tus datos (esos están en IndexedDB, aparte).
//
// publicar.ps1 cambia VERSION en cada publicación. Al cambiar este archivo,
// el iPhone detecta que hay versión nueva, la descarga y la activa.
const VERSION = '2026.11.20-1';
const CACHE = `lisa-${VERSION}`;

const ARCHIVOS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/db.js',
  'js/fotos.js',
  'js/version.js',
  'vendor/chart.umd.min.js',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/favicon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      // cache: 'reload' evita copias viejas del navegador o de GitHub
      cache.addAll(ARCHIVOS.map((url) => new Request(url, { cache: 'reload' })))
    )
  );
});

// La app avisa "activar" cuando la versión nueva está lista.
self.addEventListener('message', (event) => {
  if (event.data === 'activar') self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Borra solo cachés de versiones viejas de la app (código), nunca IndexedDB.
    const nombres = await caches.keys();
    await Promise.all(nombres.filter((n) => n.startsWith('lisa-') && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Al abrir la app: siempre la página guardada (funciona sin internet)
    if (req.mode === 'navigate') {
      return (await cache.match('index.html')) || fetch(req);
    }
    const guardado = await cache.match(req, { ignoreSearch: true });
    if (guardado) return guardado;
    try {
      return await fetch(req);
    } catch {
      return new Response('', { status: 504, statusText: 'Sin conexión' });
    }
  })());
});
