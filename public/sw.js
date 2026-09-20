/**
 * NaHaber Service Worker — Web Push + Offline Cache + installability
 *
 * Chrome/Edge beforeinstallprompt requires a controlling SW with a fetch
 * handler. This file is registered early on every visit (see ServiceWorkerRegister).
 *
 * OneSignal is imported here so we keep a single SW at scope `/` instead of
 * fighting OneSignalSDKWorker.js for the same registration.
 */
importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js')

// Bump when fetch/cache policy changes so clients drop stale HTML shells.
const CACHE_VERSION = 'nahaber-v8'
const LOCAL_DEV_HOSTS = new Set(['localhost', '127.0.0.1'])

function isLocalDev() {
  return LOCAL_DEV_HOSTS.has(self.location.hostname)
}
const STATIC_CACHE = [
  '/offline',
  '/favicon.ico',
  '/brand/icon-192.png',
  '/brand/icon-512.png',
  '/apple-touch-icon.png',
  '/manifest.webmanifest',
]

// ── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  if (isLocalDev()) {
    self.skipWaiting()
    return
  }
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_CACHE))
  )
  self.skipWaiting()
})

// ── Activate ──────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      const stale = isLocalDev() ? keys : keys.filter((k) => k !== CACHE_VERSION)
      await Promise.all(stale.map((k) => caches.delete(k)))
    })()
  )
  self.clients.claim()
})

// ── Push ──────────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
  if (!event.data) return

  let payload
  try {
    payload = event.data.json()
  } catch {
    payload = { title: 'NaHaber', body: event.data.text(), url: '/' }
  }

  const title = payload.title ?? 'NaHaber'
  const options = {
    body: payload.body ?? '',
    icon: '/brand/icon-192.png',
    badge: '/brand/badge-72.png',
    image: payload.image ?? undefined,
    tag: payload.tag ?? 'nahaber-news',
    renotify: true,
    requireInteraction: payload.breaking === true,
    data: { url: payload.url ?? '/', postId: payload.postId ?? null },
    actions: payload.breaking
      ? [{ action: 'open', title: 'Haberi Gör' }]
      : [],
  }

  event.waitUntil(self.registration.showNotification(title, options))
})

// ── Notification click ────────────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const url = event.notification.data?.url ?? '/'

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clients) => {
        // Focus existing tab if already open
        const existing = clients.find((c) => c.url.includes(self.location.origin))
        if (existing) {
          existing.focus()
          existing.postMessage({ type: 'NAVIGATE', url })
          return
        }
        return self.clients.openWindow(url)
      })
  )
})

// ── Fetch (network-first, cache fallback, offline page) ──────────────────
self.addEventListener('fetch', (event) => {
  if (isLocalDev()) return
  // Only cache same-origin GET requests
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return

  const requestPath = new URL(event.request.url).pathname
  // Dev chunks keep a stable /_next/static/chunks/app/page.js URL — never cache them.
  if (requestPath.startsWith('/_next/')) return
  if (requestPath.startsWith('/api/')) return

  const isNavigation =
    event.request.mode === 'navigate' ||
    (event.request.method === 'GET' &&
      (event.request.headers.get('accept') || '').includes('text/html'))

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Never put HTML navigations into Cache Storage — Capacitor remote
        // WebView and Safari must always get a fresh document shell after
        // deploy. Only cache non-HTML assets for offline fallback.
        if (res.status === 200 && !isNavigation) {
          const clone = res.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone))
        }
        return res
      })
      .catch(async () => {
        const cached = await caches.match(event.request)
        if (cached) return cached
        // For HTML navigations, serve the offline fallback page
        if (isNavigation) {
          const offline = await caches.match('/offline')
          if (offline) return offline
        }
        return Response.error()
      })
  )
})
