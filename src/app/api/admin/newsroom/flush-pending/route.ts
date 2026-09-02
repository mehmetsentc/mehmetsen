/**
 * POST /api/admin/newsroom/flush-pending
 *
 * Tek tuş: önce taze RSS çek (breaking + gündem + ANKA), sonra yalnızca
 * bu koşuda / son dakikalarda oluşan kuyruk kalemlerini AI ile yazıp yayınla.
 * Eski 800+ backlog boşaltılmaz.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminFirestore, Collections } from '@/lib/firebase/admin'
import { processNewsQueue } from '@/services/newsroom/queue/queueProcessor'
import { newsDraftService } from '@/services/newsDraftService'
import { runBreakingWorker } from '@/services/newsroom/workers/breakingWorker'
import { runGundemWorker } from '@/services/newsroom/workers/gundemWorker'
import { runAnkaBreakingWorker } from '@/services/newsroom/workers/ankaBreakingWorker'
import type { NewsroomRunResult } from '@/services/newsroom/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const RECENT_QUEUE_BUFFER_MS = 20 * 60 * 1000
const PROCESS_DEADLINE_MS = 270_000

function ingestSummary(
  label: string,
  result: PromiseSettledResult<NewsroomRunResult>
): { label: string; ok: boolean; itemsNew?: number; error?: string } {
  if (result.status === 'fulfilled') {
    return { label, ok: true, itemsNew: result.value.itemsNew }
  }
  return {
    label,
    ok: false,
    error: result.reason instanceof Error ? result.reason.message : String(result.reason),
  }
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:publish')
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    approveDrafts?: boolean
    maxRounds?: number
  }

  const approveDrafts = body.approveDrafts !== false
  const maxRounds = Math.max(1, Math.min(12, body.maxRounds ?? 8))
  const runStartedAt = Date.now()
  const minCreatedAt = runStartedAt - RECENT_QUEUE_BUFFER_MS

  const ingestSettled = await Promise.allSettled([
    runBreakingWorker(),
    runGundemWorker(),
    runAnkaBreakingWorker(),
  ])
  const ingest = [
    ingestSummary('breaking', ingestSettled[0]!),
    ingestSummary('gundem', ingestSettled[1]!),
    ingestSummary('anka-breaking', ingestSettled[2]!),
  ]
  const ingestNew = ingest.reduce((sum, row) => sum + (row.itemsNew ?? 0), 0)

  const db = getAdminFirestore()
  const queueStats = {
    rounds: 0,
    published: 0,
    drafted: 0,
    skipped: 0,
    failed: 0,
    remainingRecent: 0,
  }

  for (let i = 0; i < maxRounds; i++) {
    if (Date.now() - runStartedAt > PROCESS_DEADLINE_MS) break

    const result = await processNewsQueue(db, 40, {
      skipFreshnessCheck: false,
      minCreatedAt,
    })
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
    .where('createdAt', '>=', minCreatedAt)
    .limit(50)
    .get()
    .catch(() => null)
  queueStats.remainingRecent = remainingSnap?.size ?? 0

  const draftApprove = {
    approved: 0,
    skipped: 0,
    errors: [] as string[],
    total: 0,
    /** P18.1: flush must not invent a human UID — only approve when CMS actor is present. */
    blockedWithoutActor: 0,
  }
  if (approveDrafts) {
    if (!auth.uid) {
      draftApprove.blockedWithoutActor = 1
      draftApprove.errors.push(
        'PUBLICATION_AUTHORITY_REJECTED: flush-pending cannot invent HUMAN_EDITOR actor'
      )
    } else {
    const snap = await db
      .collection(Collections.NEWS_DRAFTS)
      .where('draftStatus', '==', 'pending_review')
      .orderBy('createdAt', 'desc')
      .limit(80)
      .get()
      .catch(async () =>
        db
          .collection(Collections.NEWS_DRAFTS)
          .where('draftStatus', '==', 'pending_review')
          .limit(80)
          .get()
      )

    const docs = snap.docs.filter((d) => {
      const createdAt = (d.data() as { createdAt?: number }).createdAt ?? 0
      return createdAt >= minCreatedAt
    })
    draftApprove.total = docs.length

    for (const doc of docs) {
      try {
        // Authenticated CMS user who triggered flush is the publication actor.
        await newsDraftService.approveDraft(doc.id, { uid: auth.uid })
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
  }

  return NextResponse.json({
    ok: true,
    ingest,
    ingestNew,
    queue: queueStats,
    drafts: draftApprove,
    message: [
      `Kaynak: ${ingestNew} yeni haber`,
      `Kuyruk: ${queueStats.published} yayın, ${queueStats.drafted} taslak`,
      approveDrafts ? `Onay: ${draftApprove.approved}/${draftApprove.total}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  })
}
