import { AsyncLocalStorage } from 'node:async_hooks'
import { notePublicFirestoreReads, publicReadCircuitOpen } from '@/lib/finops/publicReadBudget'

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

/** Public windows only. Keys are query shape, never user/seen/like state. */
/** FinOps 2 Oct: 45s cost ~600k category reads/day; 2 min keeps feeds fresh enough. */
export const FEED_PUBLIC_POOL_TTL_MS = 120_000
const PUBLIC_POOL_MAX = 48
const publicPools = new Map<string, { at: number; snap: CachedSnap }>()

export function resetPublicFeedPoolForTests(): void {
  publicPools.clear()
}

function rememberPublicPool(key: string, snap: CachedSnap): void {
  if (publicPools.has(key)) publicPools.delete(key)
  publicPools.set(key, { at: Date.now(), snap })
  while (publicPools.size > PUBLIC_POOL_MAX) {
    const oldest = publicPools.keys().next().value
    if (!oldest) break
    publicPools.delete(oldest)
  }
}

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

  const shared = publicPools.get(key)
  const fresh = Boolean(shared && Date.now() - shared.at < FEED_PUBLIC_POOL_TTL_MS)
  if (shared && (fresh || publicReadCircuitOpen())) {
    stats.cacheHits += 1
    cache?.set(key, shared.snap)
    console.info(
      '[finops_public_cache]',
      JSON.stringify({
        route: 'feed-public-pool',
        cache: fresh ? 'hit' : 'stale',
        documentsRead: 0,
      })
    )
    return shared.snap as T
  }

  stats.attempts += 1
  const snap = await q.get()
  stats.documentsRead += snap.docs.length
  notePublicFirestoreReads('feed-public-pool', snap.docs.length)
  cache?.set(key, snap)
  rememberPublicPool(key, snap)
  return snap
}

/** Stdout only. No database write. */
export function logFeedFsFallback(payload: Record<string, unknown>): void {
  console.info('[feed_fs_fallback]', JSON.stringify(payload))
}
