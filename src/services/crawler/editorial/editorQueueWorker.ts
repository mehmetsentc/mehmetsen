/**
 * Background worker for editor-initiated AI queue.
 *
 * Called by /api/cron/newsroom/editor-ai-queue every minute.
 * Picks up AI_QUEUED articles, marks them AI_PROCESSING, then runs the
 * newsroom pipeline for each. On failure, marks them back to NEW so they
 * can be retried or rejected manually.
 */
import { DrizzleCrawlerStore } from '../store/drizzle'
import { publishRawArticleWithAi } from './aiPublish'

/** Process up to 12 articles per cron tick with concurrency 4. */
export const WORKER_BATCH_SIZE = 12
export const WORKER_CONCURRENCY = 4

/** Editor AI cron maxDuration is 300s; recover leases older than 3 minutes. */
export const EDITOR_AI_STALE_PROCESSING_MS = 3 * 60 * 1000

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
        const item = await publishRawArticleWithAi({ store, rawArticleId: article.id })

        if (item.outcome === 'published' || item.outcome === 'updated' || item.outcome === 'already_published') {
          result.published += 1
        } else if (item.outcome === 'draft') {
          result.drafted += 1
        } else if (item.outcome === 'skipped') {
          result.skipped += 1
          const skipReason = item.error || 'Atlandı: kriterler karşılanmadı'
          await store.updateRawArticle(article.id, {
            editorialStatus: 'NEW',
            aiSkipReason: skipReason.slice(0, 80),
            rejectionNote: skipReason,
          }).catch(() => {})
        } else {
          // 'error' or 'locked'
          result.failed += 1
          const failReason = item.error || 'AI üretim hatası'
          await store.updateRawArticle(article.id, {
            editorialStatus: 'NEW',
            aiSkipReason: failReason.slice(0, 80),
            rejectionNote: failReason,
          }).catch(() => {})
        }
      } catch (err) {
        result.failed += 1
        const errMsg = err instanceof Error ? err.message : String(err)
        console.error(`[editorQueueWorker] article ${article.id} failed:`, errMsg)
        await store.updateRawArticle(article.id, {
          editorialStatus: 'NEW',
          aiSkipReason: errMsg.slice(0, 80),
          rejectionNote: errMsg,
        }).catch(() => {})
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
