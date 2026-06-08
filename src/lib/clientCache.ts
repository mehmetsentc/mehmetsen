import { devLog } from '@/lib/asyncUtils'

/**
 * Lightweight client-side cache for instant re-entry (stale-while-revalidate).
 *
 * Two layers:
 *  1. An in-memory Map that is instant within a single SPA session (survives
 *     client-side navigation but not a full reload).
 *  2. Web Storage persistence (sessionStorage by default, localStorage opt-in)
 *     so data survives reloads / tab restores.
 *
 * Every entry carries a TTL and a global schema version. Bumping CACHE_VERSION
 * invalidates all previously persisted entries automatically.
 */

const CACHE_VERSION = 'v1'
const KEY_PREFIX = `nahaber:cache:${CACHE_VERSION}:`

export type CachePersistence = 'session' | 'local'

interface CacheEnvelope<T> {
  v: string
  /** Epoch ms when the entry expires. */
  expires: number
  data: T
}

const memory = new Map<string, CacheEnvelope<unknown>>()

const DEFAULT_TTL_MS = 5 * 60 * 1000 // 5 minutes

function storageFor(persistence: CachePersistence): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return persistence === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function storageKey(key: string): string {
  return `${KEY_PREFIX}${key}`
}

function isFresh(envelope: CacheEnvelope<unknown>): boolean {
  return envelope.v === CACHE_VERSION && envelope.expires > Date.now()
}

/**
 * Reads a cached value. Returns `null` when missing, expired, or version-stale.
 * Checks the in-memory layer first, then falls back to persisted storage.
 */
export function getCache<T>(
  key: string,
  persistence: CachePersistence = 'session'
): T | null {
  const mem = memory.get(key)
  if (mem) {
    if (isFresh(mem)) return mem.data as T
    memory.delete(key)
  }

  const storage = storageFor(persistence)
  if (!storage) return null

  try {
    const raw = storage.getItem(storageKey(key))
    if (!raw) return null
    const envelope = JSON.parse(raw) as CacheEnvelope<T>
    if (!isFresh(envelope)) {
      storage.removeItem(storageKey(key))
      return null
    }
    // Re-hydrate the memory layer for subsequent instant reads.
    memory.set(key, envelope)
    return envelope.data
  } catch (error) {
    devLog('clientCache', `getCache failed for ${key}`, error)
    return null
  }
}

/**
 * Writes a value to both cache layers with a TTL. Quota errors are swallowed
 * (memory cache still works); on quota failure we attempt to free space by
 * clearing this cache's persisted entries once.
 */
export function setCache<T>(
  key: string,
  data: T,
  ttl: number = DEFAULT_TTL_MS,
  persistence: CachePersistence = 'session'
): void {
  const envelope: CacheEnvelope<T> = {
    v: CACHE_VERSION,
    expires: Date.now() + ttl,
    data,
  }
  memory.set(key, envelope)

  const storage = storageFor(persistence)
  if (!storage) return

  const serialized = (() => {
    try {
      return JSON.stringify(envelope)
    } catch (error) {
      devLog('clientCache', `serialize failed for ${key}`, error)
      return null
    }
  })()
  if (serialized === null) return

  try {
    storage.setItem(storageKey(key), serialized)
  } catch (error) {
    // Likely QuotaExceededError — drop our own stale entries and retry once.
    devLog('clientCache', `setItem quota hit for ${key}, evicting`, error)
    clearCache(undefined, persistence)
    try {
      storage.setItem(storageKey(key), serialized)
    } catch {
      // Give up on persistence; memory cache remains valid for this session.
    }
  }
}

/**
 * Clears cached entries. With no prefix, clears all entries owned by this cache
 * (both memory and the given storage). With a prefix, clears matching keys only.
 */
export function clearCache(
  prefix?: string,
  persistence: CachePersistence = 'session'
): void {
  for (const key of Array.from(memory.keys())) {
    if (!prefix || key.startsWith(prefix)) memory.delete(key)
  }

  const storage = storageFor(persistence)
  if (!storage) return

  try {
    const fullPrefix = prefix ? storageKey(prefix) : KEY_PREFIX
    const toRemove: string[] = []
    for (let i = 0; i < storage.length; i += 1) {
      const k = storage.key(i)
      if (k && k.startsWith(fullPrefix)) toRemove.push(k)
    }
    toRemove.forEach((k) => storage.removeItem(k))
  } catch (error) {
    devLog('clientCache', 'clearCache failed', error)
  }
}

export const CACHE_TTL = {
  SHORT: 2 * 60 * 1000,
  DEFAULT: DEFAULT_TTL_MS,
  LONG: 30 * 60 * 1000,
} as const
