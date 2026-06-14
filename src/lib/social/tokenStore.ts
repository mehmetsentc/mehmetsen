/**
 * Social Media Token Store
 *
 * Priority: Firestore (admin config) → environment variable
 * Memory cache (5 min TTL) to avoid Firestore reads on every request.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

interface TokenCache {
  fbToken: string
  igToken: string
  fetchedAt: number
}

let _cache: TokenCache | null = null

async function fetchFromFirestore(): Promise<{ fbToken: string; igToken: string }> {
  const db = getAdminFirestore()
  const doc = await db.collection('config').doc('socialMedia').get()
  const data = doc.data() ?? {}
  return {
    fbToken: (data.facebookPageToken as string | undefined)?.trim() ?? '',
    igToken: (data.instagramToken as string | undefined)?.trim() ?? '',
  }
}

/**
 * Returns the active social media tokens.
 * Reads from Firestore if cache is stale; falls back to env vars.
 */
export async function getSocialTokens(): Promise<{ fbToken: string; igToken: string }> {
  const now = Date.now()

  // Cache hit
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS) {
    return { fbToken: _cache.fbToken, igToken: _cache.igToken }
  }

  try {
    const { fbToken: fsFb, igToken: fsIg } = await fetchFromFirestore()

    // Prefer Firestore value; fall back to env var
    const fbToken = fsFb || process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() || ''
    const igToken = fsIg || process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || fbToken

    _cache = { fbToken, igToken, fetchedAt: now }
    return { fbToken, igToken }
  } catch {
    // Firestore unavailable — use env vars
    const fbToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim() ?? ''
    const igToken = process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || fbToken
    return { fbToken, igToken }
  }
}

/** Invalidate the in-memory cache (call after updating Firestore). */
export function invalidateTokenCache(): void {
  _cache = null
}
