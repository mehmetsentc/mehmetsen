/**
 * POST /api/admin/queue/purge
 * Marks old pending/failed/dead_letter queue items as dead_letter so
 * process-queue stops retrying them and picks up fresh news instead.
 *
 * Body: { olderThanHours?: number } — default 12
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'admin')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { olderThanHours?: number }
  const olderThanHours = Math.max(1, Math.min(720, body.olderThanHours ?? 12))
  const cutoff = Date.now() - olderThanHours * 60 * 60 * 1000

  const db = getAdminFirestore()
  const col = db.collection(Collections.NEWS_QUEUE)
  const now = Date.now()

  const STATUSES = ['pending', 'failed', 'dead_letter'] as const
  let total = 0
  const details: Record<string, number> = {}

  for (const status of STATUSES) {
    let processed = 0
    let lastDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null

    // Paginate in batches of 400 to avoid Firestore write-batch limits
    while (true) {
      let q = col
        .where('status', '==', status)
        .where('createdAt', '<', cutoff)
        .orderBy('createdAt', 'asc')
        .limit(400)

      if (lastDoc) q = q.startAfter(lastDoc)

      const snap = await q.get()
      if (snap.empty) break

      const batch = db.batch()
      for (const doc of snap.docs) {
        batch.update(doc.ref, {
          status: 'dead_letter',
          lastError: `purged_by_admin_older_than_${olderThanHours}h`,
          updatedAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          claimedAt: null,
        })
      }
      await batch.commit()

      processed += snap.docs.length
      lastDoc = snap.docs[snap.docs.length - 1] ?? null

      if (snap.docs.length < 400) break
    }

    details[status] = processed
    total += processed
  }

  return NextResponse.json({
    success: true,
    purged: total,
    details,
    cutoffHours: olderThanHours,
    cutoffDate: new Date(cutoff).toISOString(),
  })
}
