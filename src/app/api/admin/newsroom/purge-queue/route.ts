/**
 * POST /api/admin/newsroom/purge-queue
 *
 * Bulk-delete old pending newsQueue items.
 * Useful for clearing the 37k backlog that accumulated before the
 * auto-publish disable change.
 *
 * Body (optional):
 *   { olderThanHours?: number, keepToday?: boolean, batchSize?: number, dryRun?: boolean }
 *
 * Defaults: purge items older than 24h, keep today's, batch of 500.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore, Collections } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:publish')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    olderThanHours?: number
    keepToday?: boolean
    batchSize?: number
    dryRun?: boolean
  }

  const olderThanHours = Math.max(1, body.olderThanHours ?? 24)
  const keepToday = body.keepToday !== false
  const batchSize = Math.max(50, Math.min(500, body.batchSize ?? 500))
  const dryRun = body.dryRun === true

  const db = getAdminFirestore()
  const cutoffMs = Date.now() - olderThanHours * 60 * 60 * 1000

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayMs = todayStart.getTime()

  let totalDeleted = 0
  let totalSkipped = 0
  let rounds = 0
  const maxRounds = 20

  while (rounds < maxRounds) {
    rounds++

    const snap = await db
      .collection(Collections.NEWS_QUEUE)
      .where('status', '==', 'pending')
      .where('createdAt', '<', cutoffMs)
      .orderBy('createdAt', 'asc')
      .limit(batchSize)
      .get()
      .catch(async () => {
        return db
          .collection(Collections.NEWS_QUEUE)
          .where('status', '==', 'pending')
          .limit(batchSize)
          .get()
      })

    if (snap.empty) break

    const toDelete = snap.docs.filter((d) => {
      if (!keepToday) return true
      const created = Number(d.data().createdAt ?? 0)
      return created < todayMs
    })

    totalSkipped += snap.docs.length - toDelete.length

    if (toDelete.length === 0) break

    if (!dryRun) {
      const FIRESTORE_BATCH_LIMIT = 500
      for (let i = 0; i < toDelete.length; i += FIRESTORE_BATCH_LIMIT) {
        const chunk = toDelete.slice(i, i + FIRESTORE_BATCH_LIMIT)
        const batch = db.batch()
        for (const docSnap of chunk) {
          batch.delete(docSnap.ref)
        }
        await batch.commit()
      }
    }

    totalDeleted += toDelete.length

    if (snap.docs.length < batchSize) break
  }

  const remainingSnap = await db
    .collection(Collections.NEWS_QUEUE)
    .where('status', '==', 'pending')
    .limit(1)
    .get()
    .catch(() => ({ size: -1 }))

  return NextResponse.json({
    ok: true,
    dryRun,
    deleted: totalDeleted,
    skipped: totalSkipped,
    rounds,
    cutoffHours: olderThanHours,
    keepToday,
    hasMorePending: remainingSnap.size > 0,
    message: dryRun
      ? `Dry run: ${totalDeleted} silinecek, ${totalSkipped} korunacak`
      : `${totalDeleted} eski kuyruk öğesi silindi, ${totalSkipped} korundu`,
  })
}
