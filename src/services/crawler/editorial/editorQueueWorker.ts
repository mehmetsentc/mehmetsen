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

/** Process at most this many articles per cron tick. */
const WORKER_BATCH_SIZE = 5

/** Editor AI cron maxDuration is 300s; recover leases older than 2× that. */
export const EDITOR_AI_STALE_PROCESSING_MS = 10 * 60 * 1000

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
  batchSize = WORKER_BATCH_SIZE
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

  // 3. Process each article sequentially through the newsroom pipeline
  for (const article of queued) {
    try {
      const item = await publishRawArticleWithAi({ store, rawArticleId: article.id })

      if (item.outcome === 'published' || item.outcome === 'updated' || item.outcome === 'already_published') {
        result.published += 1
      } else if (item.outcome === 'draft') {
        result.drafted += 1
      } else if (item.outcome === 'skipped') {
        result.skipped += 1
        // publishRawArticleWithAi didn't write a final status — reset to NEW
        await store.updateRawArticle(article.id, { editorialStatus: 'NEW' }).catch(() => {})
      } else {
        // 'error' or 'locked'
        result.failed += 1
        // Reset so editors can see the article again or retry
        await store.updateRawArticle(article.id, { editorialStatus: 'NEW' }).catch(() => {})
      }
    } catch (err) {
      result.failed += 1
      console.error(
        `[editorQueueWorker] article ${article.id} failed:`,
        err instanceof Error ? err.message : err
      )
      // Reset to NEW on unexpected error
      await store.updateRawArticle(article.id, { editorialStatus: 'NEW' }).catch(() => {})
    }
  }

  result.durationMs = Date.now() - startedAt
  console.log(
    `[editorQueueWorker] claimed=${result.claimed} pub=${result.published} ` +
      `draft=${result.drafted} skip=${result.skipped} fail=${result.failed} ` +
      `ms=${result.durationMs}`
  )
  return result
}
