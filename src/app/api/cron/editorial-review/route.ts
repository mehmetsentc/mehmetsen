/**
 * GET /api/cron/editorial-review
 *
 * Periyodik AI Genel Yayın Editörü — her 5 dakikada çalışır.
 * editorialReviewedAt alanı olmayan pending haberleri alır, AI ile inceler.
 * - Benzersiz → insan yayını bekler (otomatik yayın YOK — P18.1)
 * - Tekrar → isDuplicate=true ile pending bırakır
 */

import { NextResponse } from 'next/server'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { runEditorialReview, applyReviewToFirestore } from '@/lib/editorial/aiEditorialReview'

export const runtime = 'nodejs'
export const maxDuration = 120

const CRON_SECRET = process.env.CRON_SECRET ?? ''
const BATCH_SIZE = 10 // Her çalışmada max 10 haber işle

function isAuthorized(req: Request): boolean {
  const auth = req.headers.get('Authorization') ?? ''
  return auth === `Bearer ${CRON_SECRET}` && CRON_SECRET.length > 0
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // editorialReviewedAt olmayan pending haberleri al
  // Not: Firestore "field does not exist" için __name__ trick ya da client-side filter kullanılır
  const snap = await getAdminFirestore()
    .collection('news')
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'desc')
    .limit(BATCH_SIZE * 3) // Daha fazla çek, reviewed olanları filtrele
    .get()

  // editorialReviewedAt olmayan (henüz incelenmemiş) haberleri filtrele
  const unreviewed = snap.docs
    .filter((d) => !d.data().editorialReviewedAt)
    .slice(0, BATCH_SIZE)

  if (unreviewed.length === 0) {
    return NextResponse.json({ processed: 0, message: 'İncelenecek yeni haber yok' })
  }

  const { isLegacyDirectAiEnabled } = await import('@/services/crawler/legacyFlags')
  if (!isLegacyDirectAiEnabled()) {
    return NextResponse.json({
      mode: 'legacy_disabled',
      aiRequests: 0,
      processed: 0,
      reason: 'LEGACY_DIRECT_AI_ENABLED=false',
    })
  }

  let published = 0
  let duplicate = 0
  let errors = 0

  for (const doc of unreviewed) {
    const data = doc.data()
    try {
      const review = await runEditorialReview({
        id: doc.id,
        title: String(data.title || ''),
        summary: data.summary ? String(data.summary) : null,
        categoryId: data.categoryId ? String(data.categoryId) : null,
      })
      await applyReviewToFirestore(doc.id, review)

      if (review.action === 'published') published++
      else duplicate++

      // Rate limit koruması
      await new Promise((r) => setTimeout(r, 400))
    } catch (err) {
      errors++
      console.error('[editorial-cron] Hata:', doc.id, err)
    }
  }

  console.log(`[editorial-cron] İşlendi: ${unreviewed.length} → yayın: ${published}, tekrar: ${duplicate}, hata: ${errors}`)
  return NextResponse.json({ processed: unreviewed.length, published, duplicate, errors })
}
