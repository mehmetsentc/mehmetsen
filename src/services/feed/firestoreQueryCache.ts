/**
 * Short-TTL in-memory cache for raw Firestore feed pages.
 * Shared across requests on the same serverless isolate; exclude/seen
 * filtering stays per-request outside this cache.
 */

export const FS_LOCAL_QUERY_CACHE_TTL_MS = 30_000
export const FS_FALLBACK_QUERY_CACHE_TTL_MS = 20_000

const MAX_ENTRIES = 256
const PURGE_PROBABILITY = 0.01

export type CachedFirestoreDoc = {
  id: string
  data: Record<string, unknown>
}

type CacheEntry = {
  value: unknown
  expiresAt: number
}

const store = new Map<string, CacheEntry>()
const inflight = new Map<string, Promise<unknown>>()

function purgeExpired(now: number): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key)
  }
}

function maybePurge(now: number): void {
  if (Math.random() < PURGE_PROBABILITY) purgeExpired(now)
}

function evictOldest(): void {
  if (store.size <= MAX_ENTRIES) return
  let oldestKey: string | null = null
  let oldestExp = Number.POSITIVE_INFINITY
  for (const [key, entry] of store) {
    if (entry.expiresAt < oldestExp) {
      oldestExp = entry.expiresAt
      oldestKey = key
    }
  }
  if (oldestKey) store.delete(oldestKey)
}

export function peekFirestoreQueryCache<T>(key: string): T | undefined {
  const entry = store.get(key)
  if (!entry) return undefined
  if (entry.expiresAt <= Date.now()) {
    store.delete(key)
    return undefined
  }
  return entry.value as T
}

export function clearFirestoreQueryCache(): void {
  store.clear()
  inflight.clear()
}

export async function getOrSetCache<T>(
  key: string,
  ttlMs: number,
  fn: () => Promise<T>
): Promise<T> {
  const hit = peekFirestoreQueryCache<T>(key)
  if (hit !== undefined) return hit

  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const promise = (async () => {
    try {
      const value = await fn()
      const now = Date.now()
      maybePurge(now)
      store.set(key, { value, expiresAt: now + Math.max(0, ttlMs) })
      evictOldest()
      return value
    } finally {
      inflight.delete(key)
    }
  })()

  inflight.set(key, promise)
  return promise as Promise<T>
}
