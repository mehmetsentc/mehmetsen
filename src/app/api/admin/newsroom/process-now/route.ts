/**
 * POST /api/admin/newsroom/process-now
 *
 * CMS "Kuyruğu hızlı işle" — Triggers process-queue immediately with larger batch
 * and bypasses freshness check for backlog recovery scenarios.
 * Claim sırası cron ile aynı: newest-first (createdAt DESC) via claimPendingQueueItems.
 *
 * Body (optional):
 *   { batchSize?: number, maxRounds?: number, skipFreshness?: boolean }
 *
 * Defaults: batchSize=80, maxRounds=5, skipFreshness=true
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { getAdminFirestore, Collections } from '@/lib/firebase/admin'
import { processNewsQueue } from '@/services/newsroom/queue/queueProcessor'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const cmsAuth = await verifyCmsToken(request, 'cron:trigger')
  const cronAuth = !cmsAuth && (await isNewsroomAuthorized(request))
  if (!cmsAuth && !cronAuth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    batchSize?: number
    maxRounds?: number
    skipFreshness?: boolean
  }

  const batchSize = Math.max(10, Math.min(100, body.batchSize ?? 80))
  const maxRounds = Math.max(1, Math.min(10, body.maxRounds ?? 5))
  const skipFreshness = body.skipFreshness !== false

  const db = getAdminFirestore()
  const startTime = Date.now()
  const totals = { rounds: 0, picked: 0, published: 0, drafted: 0, skipped: 0, failed: 0 }

  for (let i = 0; i < maxRounds; i++) {
    if (Date.now() - startTime > 270_000) break

    const pendingSnap = await db
      .collection(Collections.NEWS_QUEUE)
      .where('status', '==', 'pending')
      .limit(1)
      .get()
    if (pendingSnap.empty) break

    const result = await processNewsQueue(db, batchSize, { skipFreshnessCheck: skipFreshness })
    totals.rounds += 1
    totals.picked += result.picked
    totals.published += result.published
    totals.drafted += result.drafted
    totals.skipped += result.skipped
    totals.failed += result.failed

    if (result.picked === 0) break
  }

  const remainingSnap = await db
    .collection(Collections.NEWS_QUEUE)
    .where('status', '==', 'pending')
    .limit(1)
    .get()

  const elapsed = Date.now() - startTime
  return NextResponse.json({
    ok: true,
    ...totals,
    hasMore: !remainingSnap.empty,
    elapsedMs: elapsed,
    message: `${totals.picked} işlendi (${totals.published} yayın, ${totals.drafted} taslak, ${totals.skipped} atlandı) — ${Math.round(elapsed / 1000)}s`,
  })
}
