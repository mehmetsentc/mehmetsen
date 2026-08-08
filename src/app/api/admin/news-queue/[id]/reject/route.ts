/**
 * POST /api/admin/news-queue/[id]/reject
 *
 * Marks a newsQueue item as skipped (rejected by admin).
 */
import { NextResponse } from 'next/server'
import { verifyAdminRequest } from '@/lib/adminAuth'
import { Collections, getAdminFirestore } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(request: Request, context: RouteContext) {
  const admin = await verifyAdminRequest(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await context.params
  const body = (await request.json().catch(() => ({}))) as { reason?: string }
  const reason = body.reason?.trim() || 'Admin tarafından reddedildi'

  const db = getAdminFirestore()
  const queueRef = db.collection(Collections.NEWS_QUEUE).doc(id)
  const queueSnap = await queueRef.get()

  if (!queueSnap.exists) {
    return NextResponse.json({ error: 'Queue item not found' }, { status: 404 })
  }

  await queueRef.update({
    status: 'skipped',
    lastError: reason.slice(0, 200),
    leaseOwner: null,
    leaseExpiresAt: null,
    claimedAt: null,
    updatedAt: Date.now(),
  })

  return NextResponse.json({ ok: true })
}
