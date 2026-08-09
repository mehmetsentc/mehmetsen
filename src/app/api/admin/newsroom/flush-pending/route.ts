/**
 * POST /api/admin/newsroom/flush-pending
 *
 * Tek tuş: newsQueue'yu AI ile boşalt + pending_review draft'ları onayla.
 * Body (opsiyonel):
 *   { approveDrafts?: boolean, minConfidence?: number, maxRounds?: number }
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore, Collections } from '@/lib/firebase/admin'
import { processNewsQueue } from '@/services/newsroom/queue/queueProcessor'
import { reprocessPendingDrafts } from '@/services/newsroom/draftReprocessService'
import { newsDraftService } from '@/services/newsDraftService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:publish')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    approveDrafts?: boolean
    reprocessDrafts?: boolean
    minConfidence?: number
    maxRounds?: number
  }

  const approveDrafts = body.approveDrafts !== false
  const reprocessDrafts = body.reprocessDrafts !== false
  const minConfidence = typeof body.minConfidence === 'number' ? body.minConfidence : 0
  const maxRounds = Math.max(1, Math.min(25, body.maxRounds ?? 15))

  const db = getAdminFirestore()
  const queueStats = {
    rounds: 0,
    published: 0,
    drafted: 0,
    skipped: 0,
    failed: 0,
    remaining: 0,
  }

  for (let i = 0; i < maxRounds; i++) {
    const pendingSnap = await db
      .collection(Collections.NEWS_QUEUE)
      .where('status', '==', 'pending')
      .limit(1)
      .get()
    if (pendingSnap.empty) break

    const result = await processNewsQueue(db, 40, { skipFreshnessCheck: true })
    queueStats.rounds += 1
    queueStats.published += result.published
    queueStats.drafted += result.drafted
    queueStats.skipped += result.skipped
    queueStats.failed += result.failed

    if (result.picked === 0) break
  }

  const remainingSnap = await db
    .collection(Collections.NEWS_QUEUE)
    .where('status', '==', 'pending')
    .limit(500)
    .get()
  queueStats.remaining = remainingSnap.size

  let reprocess: Awaited<ReturnType<typeof reprocessPendingDrafts>> | null = null
  if (reprocessDrafts) {
    reprocess = await reprocessPendingDrafts()
  }

  const draftApprove = { approved: 0, skipped: 0, errors: [] as string[], total: 0 }
  if (approveDrafts) {
    const snap = await db
      .collection(Collections.NEWS_DRAFTS)
      .where('draftStatus', '==', 'pending_review')
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get()
      .catch(async () =>
        db
          .collection(Collections.NEWS_DRAFTS)
          .where('draftStatus', '==', 'pending_review')
          .limit(500)
          .get()
      )

    const docs = snap.docs.filter((d) => {
      const conf = (d.data() as { confidenceScore?: number }).confidenceScore ?? 100
      return conf >= minConfidence
    })
    draftApprove.total = docs.length

    for (const doc of docs) {
      try {
        await newsDraftService.approveDraft(doc.id)
        draftApprove.approved += 1
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        if (msg.includes('already approved') || msg.startsWith('empty_content:')) {
          draftApprove.skipped += 1
        } else {
          draftApprove.errors.push(`${doc.id}: ${msg}`)
        }
      }
    }

    if (draftApprove.approved > 0) {
      try {
        const { revalidateHomeFeedCaches } = await import('@/lib/revalidateHome')
        revalidateHomeFeedCaches()
      } catch {
        /* ignore */
      }
    }
  }

  return NextResponse.json({
    ok: true,
    queue: queueStats,
    reprocess,
    drafts: draftApprove,
    message: [
      `Kuyruk: ${queueStats.published} yayın, ${queueStats.drafted} taslak, kalan ${queueStats.remaining}`,
      reprocess
        ? `AI yeniden: ${reprocess.published} yayın, ${reprocess.stillDraft} hâlâ taslak`
        : null,
      approveDrafts
        ? `Toplu onay: ${draftApprove.approved}/${draftApprove.total}`
        : null,
    ]
      .filter(Boolean)
      .join(' · '),
  })
}
