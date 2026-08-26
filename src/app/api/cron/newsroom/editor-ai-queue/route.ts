/**
 * GET|POST /api/cron/newsroom/editor-ai-queue
 *
 * Processes the editor-initiated AI queue (AI_QUEUED raw articles).
 * Runs every minute via Vercel Cron.
 * Auth: Bearer CRON_SECRET
 */
import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { DrizzleCrawlerStore, canUseDrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { processEditorAiQueue } from '@/services/crawler/editorial/editorQueueWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** One AI request per article + headroom for enrichment fetches. */
export const maxDuration = 300

async function runEditorAiQueue() {
  if (!canUseDrizzleCrawlerStore()) {
    return {
      skipped: true,
      reason: 'DATABASE_URL not configured',
      claimed: 0,
      published: 0,
      drafted: 0,
      skipped2: 0,
      failed: 0,
    }
  }

  const store = new DrizzleCrawlerStore()
  return processEditorAiQueue(store)
}

const { GET, POST } = createNewsroomCronHandler('editor-ai-queue', runEditorAiQueue)
export { GET, POST }
