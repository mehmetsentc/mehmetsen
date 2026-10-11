/**
 * GET /api/social/news?publisherId= — recent published, public news a user can
 * pick for "Hesabımda yayımla", each with its social eligibility (and why not).
 * ≤ 40 reads. Publisher filter only for the user's own publishers.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json } from '@/lib/social/accounts/connect/routeHelpers'
import { socialEligibility } from '@/lib/social/eligibility'
import { buildPublicArticleUrl } from '@/lib/social/articleUrl'
import { extractImageUrl, isOwnContent, isSkippableForSocial } from '@/lib/social/publishOneSocial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await requireActor(request, { mutation: false })
  if ('response' in auth) return auth.response
  const publisherId = new URL(request.url).searchParams.get('publisherId')
  const mine = publisherId && [...auth.actor.publisherManage, ...auth.actor.publisherPublish].includes(publisherId)
  const col = getAdminFirestore().collection(Collections.NEWS)
  const snap = mine
    ? await col.where('publisherId', '==', publisherId).limit(40).get()
    : await col.where('status', '==', 'published').orderBy('publishedAt', 'desc').limit(40).get()
  const now = Date.now()
  const items = snap.docs
    .map((d) => {
      const data = d.data() as Record<string, unknown>
      const publishedAt = typeof data.publishedAt === 'number' ? data.publishedAt : null
      const elig = socialEligibility(data, { isOwnContent, isSkippableForSocial, extractImageUrl })
      return {
        newsId: d.id,
        title: typeof data.title === 'string' ? data.title.slice(0, 160) : '',
        publishedAt,
        citySlug: typeof data.citySlug === 'string' ? data.citySlug : null,
        imageUrl: extractImageUrl(data) ?? null,
        url: buildPublicArticleUrl(d.id, data),
        live: data.status === 'published' && (publishedAt === null || publishedAt <= now) && data.visibility !== 'private',
        eligible: elig.ok,
        code: elig.ok ? null : elig.code,
        reason: elig.ok ? null : elig.text,
        action: elig.ok ? null : elig.action,
      }
    })
    .filter((i) => i.live)
    .sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0))
  return json({ items })
}
