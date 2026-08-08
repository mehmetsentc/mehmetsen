/**
 * POST /api/admin/newsroom/requeue-skipped
 *
 * Reset skipped/dead_letter newsQueue items back to pending so the
 * process-queue cron picks them up again. Optionally extends the stale
 * window by bumping createdAt to now.
 *
 * Body: { resetCreatedAt?: boolean, batchSize?: number, includeDeadLetter?: boolean }
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore, Collections } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:publish')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    resetCreatedAt?: boolean
    batchSize?: number
    includeDeadLetter?: boolean
  }

  const resetCreatedAt = body.resetCreatedAt !== false
  const batchSize = Math.max(10, Math.min(500, body.batchSize ?? 200))
  const includeDeadLetter = body.includeDeadLetter === true

  const db = getAdminFirestore()
  const now = Date.now()
  let totalRequeued = 0

  const statuses = includeDeadLetter ? ['skipped', 'dead_letter'] : ['skipped']

  for (const status of statuses) {
    let rounds = 0
    const maxRounds = 10

    while (rounds < maxRounds) {
      rounds++
      const snap = await db
        .collection(Collections.NEWS_QUEUE)
        .where('status', '==', status)
        .limit(batchSize)
        .get()

      if (snap.empty) break

      const FIRESTORE_BATCH_LIMIT = 500
      for (let i = 0; i < snap.docs.length; i += FIRESTORE_BATCH_LIMIT) {
        const chunk = snap.docs.slice(i, i + FIRESTORE_BATCH_LIMIT)
        const batch = db.batch()
        for (const doc of chunk) {
          batch.update(doc.ref, {
            status: 'pending',
            attempts: 0,
            lastError: `requeued_by_admin_${auth.uid}`,
            leaseOwner: null,
            leaseExpiresAt: null,
            claimedAt: null,
            scheduledAt: now,
            updatedAt: now,
            ...(resetCreatedAt ? { createdAt: now } : {}),
          })
        }
        await batch.commit()
      }

      totalRequeued += snap.docs.length
      if (snap.docs.length < batchSize) break
    }
  }

  return NextResponse.json({
    ok: true,
    requeued: totalRequeued,
    resetCreatedAt,
    includeDeadLetter,
    message: `${totalRequeued} kuyruk öğesi yeniden kuyruğa alındı`,
  })
}
