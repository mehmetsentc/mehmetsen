/**
 * GET|POST /api/cron/newsroom/ai-pipeline
 *
 * 5 dakikada bir çalışan AI pipeline cron job.
 * Bekleyen kuyruk öğelerini işler (batch: 5 haber/çalışma).
 *
 * Auth: Bearer CRON_SECRET
 */
import { createNewsroomCronHandler, newsroomCronConfig } from '@/app/api/cron/newsroom/_shared'
import { processPipelineQueue } from '@/lib/ai/pipeline'

export const runtime = newsroomCronConfig.runtime
export const dynamic = newsroomCronConfig.dynamic
export const maxDuration = newsroomCronConfig.maxDuration

const { GET, POST } = createNewsroomCronHandler('ai-pipeline', processPipelineQueue)
export { GET, POST }
