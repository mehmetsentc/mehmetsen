/**
 * HABER-VIDEO — POST /api/admin/social/media-projects/{id}/news
 *   { action: 'apply', clipId } → the news page shows this rendered clip instead of its video
 *                                (the original fields are kept on the news item and restorable)
 *   { action: 'restore' }       → the news page shows its original video again
 * Only projects opened from a news item's own video. Audited; the article page is revalidated.
 */
import { revalidatePath } from 'next/cache'
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { applyToNews } from '@/lib/media/mediaStore'
import { revalidatePublishedNews } from '@/lib/revalidateHome'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const body = await readJsonBody(request)
  const r = await applyToNews(auth.ctx.uid, (await params).id, body, Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  if (r.value.slug) {
    try {
      revalidatePath(`/haber/${r.value.slug}`)
      revalidatePublishedNews(r.value.slug)
    } catch {
      // the page refreshes on its own cache schedule
    }
  }
  return json({ project: r.value.project, newsVideoUrl: r.value.newsVideoUrl })
}
