/**
 * SOCIAL-SEO-1 — location list for social location tags.
 * GET  → saved places (manual + automatically found / not found)
 * POST { citySlug, districtSlug?, placeId?, name? } → manual place id (empty placeId clears it)
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { SOCIAL_PLACES_COLLECTION, extractPlaceId, isValidPlaceId, placeKeys, type SocialPlaceDoc } from '@/lib/social/placeResolver'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SLUG = /^[a-z0-9-]{2,40}$/

export async function GET(request: Request) {
  const auth = await requireAccountManager(request, { mutation: false })
  if ('response' in auth) return auth.response
  const snap = await getAdminFirestore().collection(SOCIAL_PLACES_COLLECTION).limit(500).get()
  const places = snap.docs
    .map((d) => ({ key: d.id, ...(d.data() as SocialPlaceDoc) }))
    .sort((a, b) => a.key.localeCompare(b.key, 'tr'))
  return json({ places })
}

export async function POST(request: Request) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const citySlug = typeof body.citySlug === 'string' ? body.citySlug.trim().toLowerCase() : ''
  const districtSlug = typeof body.districtSlug === 'string' ? body.districtSlug.trim().toLowerCase() : ''
  if (!SLUG.test(citySlug) || (districtSlug && !SLUG.test(districtSlug))) {
    return json({ error: 'İl / ilçe kısa adı geçersiz (ör. canakkale, gelibolu)' }, 400)
  }
  const key = placeKeys({ citySlug, districtSlug })[0]!
  const ref = getAdminFirestore().collection(SOCIAL_PLACES_COLLECTION).doc(key)
  const rawId = typeof body.placeId === 'string' ? body.placeId.trim() : ''
  if (!rawId) {
    // clear the manual id; the automatic lookup may try again
    await ref.set({ placeId: null, source: 'auto', checkedAt: 0, note: 'manual_cleared' } satisfies SocialPlaceDoc)
    return json({ ok: true, key, placeId: null })
  }
  const placeId = extractPlaceId(rawId)
  if (!isValidPlaceId(placeId)) return json({ error: 'Facebook yer sayfası kimliği bulunamadı (yalnızca rakamlar)' }, 400)
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : null
  await ref.set({ placeId, name, source: 'manual', checkedAt: Date.now(), note: null } satisfies SocialPlaceDoc)
  return json({ ok: true, key, placeId })
}
