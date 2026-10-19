/* Service worker del Monitor ECG (escrito a mano, sin CDN). Compatible con CSP worker-src 'self'.
   Estrategia: app shell en caché para uso sin conexión de lo local (los datos viven en IndexedDB);
   navegación network-first con respaldo a index.html; /assets/* (con hash) cache-first.
   Nunca intercepta otros orígenes (Supabase) ni métodos distintos de GET. */
const VERSION = 'ecg-build-dev' // sustituido en el build por vite.config.js
const SHELL = `ecg-shell-${VERSION}`
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icon.svg', '/favicon.svg', '/icons/icon-192.png', '/icons/icon-512.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(PRECACHE)))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('ecg-shell-') && k !== SHELL).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting()
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((r) => {
          const copy = r.clone()
          caches.open(SHELL).then((c) => c.put('/index.html', copy))
          return r
        })
        .catch(() => caches.match('/index.html')),
    )
    return
  }
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((r) => {
          if (r.ok && (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/referencias/'))) {
            const copy = r.clone()
            caches.open(SHELL).then((c) => c.put(req, copy))
          }
          return r
        }),
    ),
  )
})
