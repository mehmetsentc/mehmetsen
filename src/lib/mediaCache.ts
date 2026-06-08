/**
 * Tracks media URLs that have been successfully fetched this session.
 * Relies on browser HTTP cache for bytes — we only persist URL strings.
 */

const STORAGE_KEY = 'nahaber:mediaFetched:v1'
const MAX_TRACKED = 200

const memory = new Set<string>()
let hydrated = false

function hydrateFromStorage(): void {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const urls = JSON.parse(raw) as string[]
    if (Array.isArray(urls)) {
      urls.forEach((url) => {
        if (typeof url === 'string') memory.add(url)
      })
    }
  } catch {
    // ignore corrupt storage
  }
}

function persistToStorage(): void {
  if (typeof window === 'undefined') return
  try {
    const urls = Array.from(memory).slice(-MAX_TRACKED)
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(urls))
  } catch {
    // quota — memory layer still works
  }
}

export function hasMediaBeenFetched(url: string): boolean {
  hydrateFromStorage()
  return memory.has(url)
}

export function markMediaFetched(url: string): void {
  if (!url) return
  hydrateFromStorage()
  if (memory.has(url)) return
  memory.add(url)
  if (memory.size > MAX_TRACKED) {
    const excess = memory.size - MAX_TRACKED
    const iter = memory.values()
    for (let i = 0; i < excess; i += 1) {
      const next = iter.next()
      if (!next.done) memory.delete(next.value)
    }
  }
  persistToStorage()
}

/** Called by AppStateProvider on mount to warm the in-memory set. */
export function hydrateMediaCache(): void {
  hydrateFromStorage()
}
