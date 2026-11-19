// JK Academic Tools Hub app: makes the site installable and opens it when the
// connection drops. Only this site's own pages and files are cached; payments,
// orders, reports and chats always go to the servers live (other addresses,
// never touched here).
const CACHE = 'jk-site-v1'
const SHELL = ['/', '/manifest.webmanifest', '/icon-192.png', '/favicon.svg']

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key)
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Pages: always the latest from the network; the saved copy only when offline.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put('/', copy)) }
      return res
    }).catch(() => caches.match('/').then(r => r || Response.error())))
    return
  }

  // Built files have a unique name per version: safe to keep.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
      return res
    })))
    return
  }

  // Anything else on this site: network first, saved copy when offline.
  event.respondWith(fetch(req).then(res => {
    if (res.ok && /\.(png|svg|webmanifest|ico)$/.test(url.pathname)) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
    return res
  }).catch(() => caches.match(req).then(r => r || Response.error())))
})
