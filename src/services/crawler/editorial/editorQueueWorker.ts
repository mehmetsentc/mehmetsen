/**
 * Background worker for editor-initiated AI queue.
 *
 * Called by /api/cron/newsroom/editor-ai-queue every 20 minutes.
 * Picks up AI_QUEUED articles, marks them AI_PROCESSING, then runs the
 * newsroom pipeline for each. Editor-approved items must never bounce
 * back to Ham Haberler (NEW) — retries stay AI_QUEUED; junk stays REJECTED.
 */
import { DrizzleCrawlerStore } from '../store/drizzle'
import { publishRawArticleWithAi, type AiPublishOutcome } from './aiPublish'
import { isManualEditorAiEnabled } from '../automatedAiPolicy'
import { runWithAiUsageContext } from '@/lib/ai/usage/context'
import type { CrawlerEditorialStatus } from '../types'

/** Smaller parallel DeepSeek stampede — 4 concurrent writer+QA calls burned quota without publishing. */
/** 20-minute cron: 8/min would starve; 24 fits 300s (8 items were ~33s worst case). */
export const WORKER_BATCH_SIZE = 24
export const WORKER_CONCURRENCY = 2

/**
 * Follow-up editorial status after an editor-approved AI attempt.
 * `null` = publishRawArticleWithAi already wrote the row (draft / published).
 * Never returns NEW — that dumps the item back into Ham Haberler.
 */
export function resolveEditorAiFollowUpStatus(
  outcome: AiPublishOutcome | 'thrown',
  error?: string | null
): CrawlerEditorialStatus | null {
  if (
    outcome === 'published' ||
    outcome === 'updated' ||
    outcome === 'already_published' ||
    outcome === 'draft'
  ) {
    return null
  }

  const msg = (error || '').toLowerCase()
  if (outcome === 'skipped') {
    if (msg.includes('already_published') || msg.includes('zaten yayınlanmış')) return 'PUBLISHED'
    if (msg.includes('already_drafted') || msg.includes('zaten taslak')) return 'DRAFT'
    if (
      msg.includes('promotional') ||
      msg.includes('tanıtım') ||
      msg.includes('live_broadcast') ||
      msg.includes('canlı yayın')
    ) {
      return 'REJECTED'
    }
    return 'AI_QUEUED'
  }

  return 'AI_QUEUED'
}

/** Cron maxDuration is 300s. Recover only after the wall clock so in-flight DeepSeek jobs are not stolen. */
export const EDITOR_AI_STALE_PROCESSING_MS = 6 * 60 * 1000

export interface EditorQueueWorkerResult {
  claimed: number
  published: number
  drafted: number
  skipped: number
  failed: number
  /** AI_PROCESSING rows reset to AI_QUEUED after a stale lease. */
  recovered: number
  durationMs: number
}

export async function processEditorAiQueue(
  store: DrizzleCrawlerStore,
  batchSize = WORKER_BATCH_SIZE,
  concurrency = WORKER_CONCURRENCY
): Promise<EditorQueueWorkerResult> {
  const startedAt = Date.now()
  const now = new Date()

  if (!isManualEditorAiEnabled()) {
    return {
      claimed: 0,
      published: 0,
      drafted: 0,
      skipped: 0,
      failed: 0,
      recovered: 0,
      durationMs: Date.now() - startedAt,
    }
  }

  const recovered = await store.recoverStaleEditorAiProcessing(now, EDITOR_AI_STALE_PROCESSING_MS)
  if (recovered > 0) {
    console.log(`[editorQueueWorker] recovered ${recovered} stale AI_PROCESSING → AI_QUEUED`)
  }

  // 1. Fetch up to batchSize AI_QUEUED articles, oldest-first
  const queued = await store.listEditorAiQueued(batchSize)
  if (queued.length === 0) {
    return { claimed: 0, published: 0, drafted: 0, skipped: 0, failed: 0, recovered, durationMs: 0 }
  }

  // 2. Mark them AI_PROCESSING so parallel cron invocations don't double-process
  const ids = queued.map((a) => a.id)
  await store.bulkSetEditorialStatus(ids, 'AI_PROCESSING', { force: true })

  const result: EditorQueueWorkerResult = {
    claimed: ids.length,
    published: 0,
    drafted: 0,
    skipped: 0,
    failed: 0,
    recovered,
    durationMs: 0,
  }

  // 3. Process articles concurrently with bounded worker pool
  const queue = [...queued]
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const article = queue.shift()
      if (!article) break

      try {
        const item = await runWithAiUsageContext({ ingestionLane: 'manual_editor' }, () =>
          publishRawArticleWithAi({ store, rawArticleId: article.id })
        )

        if (item.outcome === 'published' || item.outcome === 'updated' || item.outcome === 'already_published') {
          result.published += 1
        } else if (item.outcome === 'draft') {
          result.drafted += 1
        } else if (item.outcome === 'skipped') {
          result.skipped += 1
          const skipReason = item.error || 'Atlandı: kriterler karşılanmadı'
          const editorialStatus = resolveEditorAiFollowUpStatus(item.outcome, skipReason)
          if (editorialStatus) {
            await store.updateRawArticle(article.id, {
              editorialStatus,
              aiSkipReason: skipReason.slice(0, 80),
              rejectionNote: skipReason,
            }).catch(() => {})
          }
        } else {
          // 'error' or 'locked' — retry in AI Kuyruğu, not Ham Haberler
          result.failed += 1
          const failReason = item.error || 'AI üretim hatası'
          const editorialStatus = resolveEditorAiFollowUpStatus(item.outcome, failReason)
          if (editorialStatus) {
            await store.updateRawArticle(article.id, {
              editorialStatus,
              aiSkipReason: failReason.slice(0, 80),
              rejectionNote: failReason,
            }).catch(() => {})
          }
        }
      } catch (err) {
        result.failed += 1
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[editorQueueWorker] article ${article.id} failed:`, errMsg)
        const editorialStatus = resolveEditorAiFollowUpStatus('thrown', errMsg)
        if (editorialStatus) {
          await store.updateRawArticle(article.id, {
            editorialStatus,
            aiSkipReason: errMsg.slice(0, 80),
            rejectionNote: errMsg,
          }).catch(() => {})
        }
      }
    }
  })

  await Promise.all(workers)

  result.durationMs = Date.now() - startedAt
  console.log(
    `[editorQueueWorker] claimed=${result.claimed} pub=${result.published} ` +
      `draft=${result.drafted} skip=${result.skipped} fail=${result.failed} ` +
      `ms=${result.durationMs}`
  )
  return result
}
