/**
 * POST /api/admin/queue/purge
 * Deletes old queue items so process-queue only works on today's news.
 * Body: { olderThanHours?: number } — default: start of today (UTC+3)
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'cron:trigger')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({})) as { olderThanHours?: number; cutoffTs?: number }

  // Default: start of today Turkey time (UTC+3)
  let cutoff: number
  if (body.cutoffTs) {
    cutoff = body.cutoffTs
  } else if (body.olderThanHours) {
    cutoff = Date.now() - body.olderThanHours * 60 * 60 * 1000
  } else {
    // Start of today in Turkey (UTC+3)
    const now = new Date()
    const turkeyOffset = 3 * 60 // minutes
    const turkeyMs = now.getTime() + (turkeyOffset + now.getTimezoneOffset()) * 60 * 1000
    const todayTurkey = new Date(turkeyMs)
    todayTurkey.setHours(0, 0, 0, 0)
    cutoff = todayTurkey.getTime() - (turkeyOffset + now.getTimezoneOffset()) * 60 * 1000
  }

  const db = getAdminFirestore()
  const col = db.collection(Collections.NEWS_QUEUE)

  const STATUSES = ['pending', 'failed', 'dead_letter', 'processing'] as const
  let totalDeleted = 0
  const details: Record<string, number> = {}

  for (const status of STATUSES) {
    let deleted = 0
    let hasMore = true

    while (hasMore) {
      const snap = await col
        .where('status', '==', status)
        .where('createdAt', '<', cutoff)
        .orderBy('createdAt', 'asc')
        .limit(400)
        .get()

      if (snap.empty) { hasMore = false; break }

      // Delete in batches of 400
      const batch = db.batch()
      for (const doc of snap.docs) {
        batch.delete(doc.ref)
      }
      await batch.commit()

      deleted += snap.docs.length
      if (snap.docs.length < 400) hasMore = false
    }

    details[status] = deleted
    totalDeleted += deleted
  }

  return NextResponse.json({
    success: true,
    deleted: totalDeleted,
    details,
    cutoffDate: new Date(cutoff).toISOString(),
    message: `${totalDeleted} eski queue item silindi`,
  })
}
