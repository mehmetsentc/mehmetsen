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

  for (const doc of docs) {
    try {
      await newsDraftService.approveDraft(doc.id)
      approved++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('already approved')) {
        skipped++
      } else {
        errors.push(`${doc.id}: ${msg}`)
      }
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
