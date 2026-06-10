/**
 * GET /api/ai/queue   — kuyruk listesi
 * DELETE /api/ai/queue/:id — kuyruktan sil (admin)
 */
import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const status = url.searchParams.get('status') // pending|processing|done|failed|rejected
  const limitParam = Math.min(100, parseInt(url.searchParams.get('limit') ?? '50'))

  const db = getAdminFirestore()

  const snap = status
    ? await db.collection(Collections.AI_QUEUE)
        .where('status', '==', status)
        .orderBy('createdAt', 'desc')
        .limit(limitParam)
        .get()
    : await db.collection(Collections.AI_QUEUE)
        .orderBy('createdAt', 'desc')
        .limit(limitParam)
        .get()

  const items = snap.docs.map((d) => ({
    id: d.id,
    status: d.data().status,
    priority: d.data().priority,
    originalTitle: d.data().originalTitle,
    sourceLabel: d.data().sourceLabel,
    createdAt: d.data().createdAt,
    updatedAt: d.data().updatedAt,
    retryCount: d.data().retryCount,
    finalNewsId: d.data().finalNewsId,
    geminiQuality: d.data().geminiResult?.qualityScore,
    gptDecision: d.data().gptResult?.decision,
    gptScore: d.data().gptResult?.score,
    errorLog: d.data().errorLog,
  }))

  return NextResponse.json({ items, count: items.length }, { headers: { 'Cache-Control': 'no-store' } })
}

/** Retry a failed item */
export async function PATCH(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json()) as { id?: string; action?: string }
  if (!body.id) return NextResponse.json({ error: 'id zorunlu' }, { status: 400 })

  const db = getAdminFirestore()
  if (body.action === 'retry') {
    await db.collection(Collections.AI_QUEUE).doc(body.id).update({
      status: 'pending',
      updatedAt: Date.now(),
      errorLog: [],
    })
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Bilinmeyen action' }, { status: 400 })
}
