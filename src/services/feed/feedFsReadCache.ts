import { AsyncLocalStorage } from 'node:async_hooks'

/** In-request Firestore query cache. Never written to Neon or Firestore. */
type CachedSnap = {
  empty: boolean
  docs: Array<{ id: string; data: () => Record<string, unknown> }>
}

export type FeedFsReadStats = {
  documentsRead: number
  cacheHits: number
  attempts: number
}

const als = new AsyncLocalStorage<Map<string, CachedSnap>>()

export function feedFsCacheActive(): boolean {
  return Boolean(als.getStore())
}

export function runWithFeedFsCache<T>(fn: () => Promise<T>): Promise<T> {
  if (als.getStore()) return fn()
  return als.run(new Map(), fn)
}

export function emptyFeedFsStats(): FeedFsReadStats {
  return { documentsRead: 0, cacheHits: 0, attempts: 0 }
}

/**
 * Same category/window/batch inside one request reuses the snapshot.
 * `documentsRead` counts only live Firestore documents, not cache hits.
 */
export async function readFeedQuery<T extends CachedSnap>(
  q: { get: () => Promise<T> },
  key: string,
  stats: FeedFsReadStats
): Promise<T> {
  const cache = als.getStore()
  const hit = cache?.get(key) as T | undefined
  if (hit) {
    stats.cacheHits += 1
    return hit
  }
  stats.attempts += 1
  const snap = await q.get()
  stats.documentsRead += snap.docs.length
  cache?.set(key, snap)
  return snap
}

/** Stdout only. No database write. */
export function logFeedFsFallback(payload: Record<string, unknown>): void {
  console.info('[feed_fs_fallback]', JSON.stringify(payload))
}
