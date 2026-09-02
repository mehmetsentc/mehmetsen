/**
 * POST /api/admin/news-drafts/bulk-approve
 *
 * Tüm pending_review taslakları toplu onaylar.
 * Opsiyonel body: { minConfidence: number } — sadece bu skorun üstündekileri onayla.
 */
import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { newsDraftService } from '@/services/newsDraftService'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/firestore'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({})) as { minConfidence?: number }
  const minConfidence = typeof body.minConfidence === 'number' ? body.minConfidence : 0

  const db = getAdminFirestore()

  // Tüm pending_review taslakları çek (max 500)
  const snap = await db
    .collection(Collections.NEWS_DRAFTS)
    .where('draftStatus', '==', 'pending_review')
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get()

  const docs = snap.docs.filter(d => {
    const conf = (d.data() as { confidenceScore?: number }).confidenceScore ?? 100
    return conf >= minConfidence
  })

  let approved = 0
  let skipped = 0
  const errors: string[] = []
  const publishedSlugs: string[] = []
  const categories = new Set<string>()
  const authors = new Set<string>()

  for (const doc of docs) {
    try {
      const result = await newsDraftService.approveDraft(doc.id, { uid: admin.uid })
      approved++
      if (result.slug) publishedSlugs.push(result.slug)
      const data = doc.data() as {
        categoryId?: string
        category?: string
        authorUsername?: string
      }
      const cat = String(data.categoryId || data.category || '').trim()
      if (cat) categories.add(cat)
      const uname = String(data.authorUsername || '').trim()
      if (uname) authors.add(uname)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('already approved') || msg.startsWith('empty_content:')) {
        skipped++
      } else {
        errors.push(`${doc.id}: ${msg}`)
      }
    }
  }

  if (approved > 0) {
    try {
      const { revalidatePath } = await import('next/cache')
      const { revalidateHomeFeedCaches } = await import('@/lib/revalidateHome')
      revalidateHomeFeedCaches()
      for (const cat of categories) {
        revalidatePath(`/kategori/${cat}`)
        if (cat === 'yerel-haber') revalidatePath('/yerel')
      }
      for (const slug of publishedSlugs) revalidatePath(`/haber/${slug}`)
      for (const uname of authors) revalidatePath(`/yazar/${uname}`)
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({
    ok: true,
    total: docs.length,
    approved,
    skipped,
    errors: errors.slice(0, 20),
  })
}
