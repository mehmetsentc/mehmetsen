import 'server-only'

/**
 * SOCIAL-SEO-1 — Facebook place (Page) id for a story's location.
 *
 * Instagram (`location_id`) and Facebook (`place`) only accept the id of a Facebook
 * place Page, not free text. Order:
 *   1. manual list (admin → Sosyal → Konumlar): district first, then city
 *   2. cached automatic lookup
 *   3. automatic lookup via Graph `pages/search` (works only if the Meta app has
 *      Page Public Metadata Access; otherwise it is remembered as unavailable)
 * No id → the post goes out without a location tag; the caption still says «📍 …».
 * Kill switch: SOCIAL_LOCATION_TAG=off.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { FACEBOOK_GRAPH_BASE } from './graphConfig'
import type { SocialLocation } from './socialSeo'

/** Firestore: socialPlaces/{citySlug} and socialPlaces/{citySlug}__{districtSlug} (Admin SDK only). */
export const SOCIAL_PLACES_COLLECTION = 'socialPlaces'

export type SocialPlaceDoc = {
  placeId: string | null
  name?: string | null
  source: 'manual' | 'auto'
  checkedAt: number
  note?: string | null
}

const FOUND_TTL_MS = 30 * 24 * 60 * 60 * 1000
const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function isLocationTagEnabled(): boolean {
  return (process.env.SOCIAL_LOCATION_TAG ?? '').trim().toLowerCase() !== 'off'
}

export function placeKeys(loc: Pick<SocialLocation, 'citySlug' | 'districtSlug'>): string[] {
  const city = (loc.citySlug ?? '').trim().toLowerCase()
  const district = (loc.districtSlug ?? '').trim().toLowerCase()
  if (!city) return []
  return district && district !== 'merkez' ? [`${city}__${district}`, city] : [city]
}

/** «https://facebook.com/profile.php?id=1234567» / «…/1234567» / «1234567» → «1234567». */
export function extractPlaceId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = raw.match(/(?:id=|\/)(\d{5,20})(?:\D|$)/) ?? raw.trim().match(/^(\d{5,20})$/)
  return m ? m[1]! : null
}

export function isValidPlaceId(v: unknown): v is string {
  return typeof v === 'string' && /^\d{5,20}$/.test(v.trim())
}

const fresh = (d: SocialPlaceDoc, now: number) =>
  d.source === 'manual' || now - (d.checkedAt || 0) < (d.placeId ? FOUND_TTL_MS : MISS_TTL_MS)

type SearchHit = { id?: string; name?: string; location?: { city?: string; country?: string } }

const trLower = (s: string) => s.toLocaleLowerCase('tr-TR')

/** Best Graph pages/search hit: a page in Turkey whose city / name matches. */
export function pickPlaceHit(hits: SearchHit[], loc: Pick<SocialLocation, 'city' | 'district'>): SearchHit | null {
  const city = trLower(loc.city ?? '')
  const district = trLower(loc.district ?? '')
  const ok = (h: SearchHit) => isValidPlaceId(h.id) && (!h.location?.country || /turkey|türkiye/i.test(h.location.country))
  const named = (h: SearchHit, w: string) => !!w && trLower(h.name ?? '').startsWith(w)
  return (
    hits.find((h) => ok(h) && district && named(h, district) && trLower(h.location?.city ?? '').includes(city)) ??
    hits.find((h) => ok(h) && district && named(h, district)) ??
    hits.find((h) => ok(h) && !district && named(h, city)) ??
    null
  )
}

async function autoLookup(loc: SocialLocation, accessToken: string): Promise<{ id: string | null; name: string | null; note: string | null }> {
  const q = loc.district ? `${loc.district}, ${loc.city}` : `${loc.city}`
  const url = `${FACEBOOK_GRAPH_BASE}/pages/search?q=${encodeURIComponent(q)}&fields=id,name,location&limit=10&access_token=${encodeURIComponent(accessToken)}`
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) })
    const json = (await res.json().catch(() => ({}))) as { data?: SearchHit[]; error?: { code?: number; message?: string } }
    if (!res.ok || json.error) return { id: null, name: null, note: `search_unavailable:${json.error?.code ?? res.status}` }
    const hit = pickPlaceHit(json.data ?? [], loc)
    return { id: hit?.id ?? null, name: hit?.name ?? null, note: hit ? null : 'no_match' }
  } catch {
    return { id: null, name: null, note: 'search_error' }
  }
}

/** Facebook place id for the story's location, or null. Never throws. */
export async function resolveFacebookPlaceId(loc: SocialLocation, accessToken?: string | null): Promise<string | null> {
  if (!isLocationTagEnabled() || !loc.city) return null
  const keys = placeKeys(loc)
  if (!keys.length) return null
  try {
    const db = getAdminFirestore()
    const col = db.collection(SOCIAL_PLACES_COLLECTION)
    const snaps = await Promise.all(keys.map((k) => col.doc(k).get()))
    const now = Date.now()
    for (const s of snaps) {
      const d = s.exists ? (s.data() as SocialPlaceDoc) : null
      if (d?.source === 'manual' && isValidPlaceId(d.placeId)) return d.placeId
    }
    const own = snaps[0]?.exists ? (snaps[0]!.data() as SocialPlaceDoc) : null
    if (own && fresh(own, now)) return isValidPlaceId(own.placeId) ? own.placeId : null
    if (!accessToken) return null
    const r = await autoLookup(loc, accessToken)
    await col
      .doc(keys[0]!)
      .set({ placeId: r.id, name: r.name, source: 'auto', checkedAt: now, note: r.note } satisfies SocialPlaceDoc, { merge: true })
      .catch(() => {})
    return r.id
  } catch {
    return null
  }
}
