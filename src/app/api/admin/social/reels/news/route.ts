/**
 * GET /api/admin/social/reels/news?q= — recent published news for the Reels studio
 * picker (no news ID needed). ≤ 80 reads; title filter is applied in memory.
 */
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { requireActor } from '@/lib/social/accounts/connect/actorRoute'
import { json } from '@/lib/social/accounts/connect/routeHelpers'
import { getCategoryLabel } from '@/lib/newsMapper'
import { extractImageUrl } from '@/lib/social/publishOneSocial'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const fold = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')

export async function GET(request: Request) {
  const auth = await requireActor(request, { mutation: false })
  if ('response' in auth) return auth.response
  const q = fold((new URL(request.url).searchParams.get('q') ?? '').trim()).slice(0, 80)
  const snap = await getAdminFirestore().collection(Collections.NEWS).where('status', '==', 'published').orderBy('publishedAt', 'desc').limit(80).get()
  const items = snap.docs
    .map((d) => {
      const x = d.data() as Record<string, unknown>
      const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
      const media = Array.isArray(x.mediaItems) ? (x.mediaItems as Array<{ type?: string; url?: string }>) : []
      return {
        newsId: d.id,
        title: str(x.title).slice(0, 160),
        category: getCategoryLabel(str(x.categoryId) || 'gundem'),
        city: str(x.city) || null,
        publishedAt: typeof x.publishedAt === 'number' ? x.publishedAt : null,
        imageUrl: extractImageUrl(x) ?? null,
        hasVideo: Boolean(str(x.videoUrl) || media.some((m) => m.type === 'video' && m.url)),
      }
    })
    .filter((i) => i.title && (!q || fold(i.title).includes(q)))
    .slice(0, 30)
  return json({ items })
}
