/**
 * POST /api/admin/editorial-review/batch
 *
 * Tüm pending haberleri AI Genel Yayın Editörü'nden geçirir.
 * - Benzersiz → otomatik yayınlanır
 * - Tekrar → isDuplicate=true ile pending kalır
 *
 * Body (opsiyonel): { limit?: number }
 * Default limit: tüm pending haberler (page page)
 */

import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { runEditorialReview, applyReviewToFirestore } from '@/lib/editorial/aiEditorialReview'
import { verifyAdminRequest } from '@/lib/adminAuth'

export const runtime = 'nodejs'
export const maxDuration = 300 // 5 dakika (çok sayıda haber için)

export async function POST(req: Request) {
  // Admin auth kontrolü
  const admin = await verifyAdminRequest(req)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({})) as { limit?: number }
  const batchLimit = Math.min(body.limit ?? 500, 500)

  // Tüm pending haberleri çek (isDuplicate olmayan önce işlensin)
  const snap = await getAdminFirestore()
    .collection('news')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .limit(batchLimit)
    .get()

  if (snap.empty) {
    return NextResponse.json({ processed: 0, published: 0, duplicate: 0, message: 'Bekleyen haber yok' })
  }

  const articles = snap.docs.map((d) => ({
    id: d.id,
    title: String(d.data().title || ''),
    summary: d.data().summary ? String(d.data().summary) : null,
    categoryId: d.data().categoryId ? String(d.data().categoryId) : null,
  }))

  let published = 0
  let duplicate = 0
  let errors = 0
  const results: Array<{ id: string; title: string; action: string; reason: string }> = []

  // Sıralı işle (rate limit ve Firestore yazma çakışması önlemek için)
  for (const article of articles) {
    try {
      const review = await runEditorialReview(article)
      await applyReviewToFirestore(article.id, review)

      if (review.action === 'published') published++
      else duplicate++

      results.push({
        id: article.id,
        title: article.title.slice(0, 80),
        action: review.action,
        reason: review.reason,
      })

      // DeepSeek rate limit için kısa bekleme
      await new Promise((r) => setTimeout(r, 300))
    } catch (err) {
      errors++
      console.error('[editorial-batch] Hata:', article.id, err)
    }
  }

  return NextResponse.json({
    processed: articles.length,
    published,
    duplicate,
    errors,
    results,
  })
}
