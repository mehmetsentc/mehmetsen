const SEEN_KEY_PREFIX = 'nahaber:reels-seen:'
const GUEST_SESSION_KEY = 'nahaber:reels-guest-id'
const MAX_SEEN_IDS = 500
const SEEN_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

interface SeenStore {
  ids: string[]
  updatedAt: number
}

function readStore(key: string): SeenStore | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as SeenStore
    if (!Array.isArray(parsed.ids)) return null
    if (Date.now() - parsed.updatedAt > SEEN_TTL_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

function writeStore(key: string, store: SeenStore): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(store))
  } catch {
    // Quota errors are non-fatal; seen tracking degrades gracefully.
  }
}

export function getOrCreateGuestSessionId(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    let id = sessionStorage.getItem(GUEST_SESSION_KEY)
    if (!id) {
      id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`
      sessionStorage.setItem(GUEST_SESSION_KEY, id)
    }
    return id
  } catch {
    return 'fallback'
  }
}

export function reelsSeenStorageKey(uid?: string | null): string {
  if (uid) return `${SEEN_KEY_PREFIX}${uid}`
  return `${SEEN_KEY_PREFIX}guest:${getOrCreateGuestSessionId()}`
}

export function getSeenPostIds(uid?: string | null): Set<string> {
  const store = readStore(reelsSeenStorageKey(uid))
  return new Set(store?.ids ?? [])
}

export function isReelSeen(postId: string, uid?: string | null): boolean {
  return getSeenPostIds(uid).has(postId)
}

export function markReelSeen(postId: string, uid?: string | null): void {
  if (typeof window === 'undefined' || !postId) return

  const key = reelsSeenStorageKey(uid)
  const store = readStore(key) ?? { ids: [], updatedAt: Date.now() }
  const ids = store.ids.filter((id) => id !== postId)
  ids.push(postId)

  while (ids.length > MAX_SEEN_IDS) {
    ids.shift()
  }

  writeStore(key, { ids, updatedAt: Date.now() })
}
