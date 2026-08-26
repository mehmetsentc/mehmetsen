/**
 * Editor-initiated AI queue enqueue.
 *
 * Fast path: marks selected raw articles as AI_QUEUED immediately so they
 * disappear from the active queue. A background cron (`editor-ai-queue`)
 * picks them up and runs the newsroom pipeline without blocking the editor.
 */
import { DrizzleCrawlerStore } from '../store/drizzle'

export const AI_ENQUEUE_BATCH_CAP = 200

export interface AiEnqueueResult {
  requested: number
  enqueued: number
  /** Articles already queued / processing / published / deleted — skipped. */
  skipped: number
}

/**
 * Mark up to AI_ENQUEUE_BATCH_CAP articles as AI_QUEUED in a single DB call.
 * Items already in PUBLISHED, DELETED, AI_QUEUED, or AI_PROCESSING state are
 * silently skipped (the guard lives in bulkSetEditorialStatus).
 */
export async function enqueueRawArticlesForAi(
  store: DrizzleCrawlerStore,
  ids: string[]
): Promise<AiEnqueueResult> {
  const deduped = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  const capped = deduped.slice(0, AI_ENQUEUE_BATCH_CAP)
  const requested = capped.length

  if (requested === 0) {
    return { requested: 0, enqueued: 0, skipped: 0 }
  }

  const enqueued = await store.bulkSetEditorialStatus(capped, 'AI_QUEUED')
  return { requested, enqueued, skipped: requested - enqueued }
}
