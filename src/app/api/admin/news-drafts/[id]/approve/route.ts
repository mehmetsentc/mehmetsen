import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { denyIfDocOutsideStaffScope } from '@/lib/cms/staffScopeHttp'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import { revalidateHomeFeedCaches, revalidatePublishedNews } from '@/lib/revalidateHome'
import { notifyPublishedArticle } from '@/lib/indexNow'
import { newsDraftService } from '@/services/newsDraftService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  // Phase 2: scoped (il/ilçe/kategori) editors may act only inside their scope.
  const admin = await verifyCmsToken(request, 'news:publish', { scopeAware: true })
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const outOfScope = await denyIfDocOutsideStaffScope(admin, Collections.NEWS_DRAFTS, id)
  if (outOfScope) return outOfScope

  try {
    const result = await newsDraftService.approveDraft(id, { uid: admin.uid })

    try {
      const db = getAdminFirestore()
      const newsSnap = await db.collection(Collections.NEWS).doc(result.newsId).get()
      const data = newsSnap.data() ?? {}
      const categoryId = String(data.categoryId || data.category || '').trim()
      const authorUsername = String(data.authorUsername || '').trim()

      revalidateHomeFeedCaches()
      if (categoryId) revalidatePath(`/kategori/${categoryId}`)
      if (categoryId === 'yerel-haber') revalidatePath('/yerel')
      revalidatePath(`/haber/${result.slug}`)
      revalidatePublishedNews(result.slug)
      if (authorUsername) revalidatePath(`/yazar/${authorUsername}`)
      void notifyPublishedArticle(result.slug).catch(() => {})
    } catch {
      /* best-effort cache bust */
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approve failed'
    const status =
      message.includes('not found')
        ? 404
        : message.includes('PUBLICATION_AUTHORITY_REJECTED') ||
            message.includes('EDITORIAL_GATE_REJECTED') ||
            message.includes('HIGH_OVERLAP')
          ? 403
          : 500
    return NextResponse.json({ error: message }, { status })
  }
}
