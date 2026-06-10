/**
 * NaHaber Service Worker — Web Push + Offline Cache
 * Handles FCM push messages and background sync.
 */

const CACHE_VERSION = 'nahaber-v1'
const STATIC_CACHE = ['/offline', '/favicon.ico']

// ── Install ───────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(STATIC_CACHE))
  )
  self.skipWaiting()
})

// ── Activate ──────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
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

// ── Fetch (network-first, cache fallback) ────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Only cache same-origin GET requests
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        // Cache successful static-ish responses
        if (res.status === 200) {
          const clone = res.clone()
          caches.open(CACHE_VERSION).then((cache) => cache.put(event.request, clone))
        }
        return res
      })
      .catch(() => caches.match(event.request))
  )
})
