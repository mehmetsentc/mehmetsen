/**
 * KURGU — POST /api/admin/video/projects/{id}/news { action:'apply'|'restore' }
 * Only projects opened from a news item's own video. The original stays on the news item and is restorable.
 */
import { revalidatePath } from 'next/cache'
import { json, readJsonBody, requireAccountManager } from '@/lib/social/accounts/connect/routeHelpers'
import { applyEditToNews } from '@/lib/edit/editStore'
import { revalidatePublishedNews } from '@/lib/revalidateHome'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Ctx) {
  const auth = await requireAccountManager(request, { mutation: true })
  if ('response' in auth) return auth.response
  const r = await applyEditToNews(auth.ctx.uid, (await params).id, await readJsonBody(request), Date.now())
  if (!r.ok) return json({ error: r.message, code: r.code }, r.status)
  if (r.value.slug) {
    try {
      revalidatePath(`/haber/${r.value.slug}`)
      revalidatePublishedNews(r.value.slug)
    } catch {
      // the page refreshes on its own cache schedule
    }
  }
  return json({ project: r.value.project })
}
