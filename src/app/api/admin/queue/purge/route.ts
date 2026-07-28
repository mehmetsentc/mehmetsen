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

  // Single-field range query — no composite index needed.
  // We delete ALL old items (any status) since published/skipped docs are
  // already finished and don't affect queue processing.
  const SKIP_STATUSES = new Set(['published', 'skipped'])
  let totalDeleted = 0
  const details: Record<string, number> = {}
  let hasMore = true

  while (hasMore) {
    const snap = await col
      .where('createdAt', '<', cutoff)
      .orderBy('createdAt', 'asc')
      .limit(400)
      .get()

    if (snap.empty) { hasMore = false; break }

    const batch = db.batch()
    let batchCount = 0
    for (const doc of snap.docs) {
      const status = (doc.data() as { status?: string }).status ?? 'unknown'
      if (SKIP_STATUSES.has(status)) continue
      batch.delete(doc.ref)
      details[status] = (details[status] ?? 0) + 1
      batchCount++
      totalDeleted++
    }
    if (batchCount > 0) await batch.commit()
    if (snap.docs.length < 400) hasMore = false
  }

  return NextResponse.json({
    success: true,
    deleted: totalDeleted,
    details,
    cutoffDate: new Date(cutoff).toISOString(),
    message: `${totalDeleted} eski queue item silindi`,
  })
}
