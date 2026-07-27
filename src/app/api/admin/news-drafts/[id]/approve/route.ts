import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'
import { revalidateHomeFeedCaches } from '@/lib/revalidateHome'
import { notifyPublishedArticle } from '@/lib/indexNow'
import { newsDraftService } from '@/services/newsDraftService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params

  try {
    const result = await newsDraftService.approveDraft(id)

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
      if (authorUsername) revalidatePath(`/yazar/${authorUsername}`)
      void notifyPublishedArticle(result.slug).catch(() => {})
    } catch {
      /* best-effort cache bust */
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approve failed'
    const status = message.includes('not found') ? 404 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
