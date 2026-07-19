/**
 * GET|POST /api/cron/newsroom/ai-pipeline
 *
 * Parallel aiQueue publisher. Disabled unless AI_QUEUE_PUBLISH_ENABLED=1
 * so RSS newsQueue remains the canonical publish path.
 *
 * Auth: Bearer CRON_SECRET
 */
import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { processPipelineQueue } from '@/lib/ai/pipeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

async function runAiPipeline() {
  if (process.env.AI_QUEUE_PUBLISH_ENABLED !== '1') {
    return {
      skipped: true,
      reason: 'AI_QUEUE_PUBLISH_ENABLED is not 1 — use newsQueue process-queue instead',
      processed: 0,
      published: 0,
      rejected: 0,
      failed: 0,
      durationMs: 0,
      items: [],
    }
  }
  return processPipelineQueue()
}

const { GET, POST } = createNewsroomCronHandler('ai-pipeline', runAiPipeline)
export { GET, POST }
