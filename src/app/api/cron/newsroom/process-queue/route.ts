import { createNewsroomCronHandler, newsroomCronConfig } from '@/app/api/cron/newsroom/_shared'
import { processNewsQueue } from '@/services/newsroom/queue/queueProcessor'

/** Vercel cron every 15 min — batch/concurrency via NEWSROOM_QUEUE_* env (defaults 20 / 2). */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('process-queue', () =>
  processNewsQueue(undefined, undefined, { skipFreshnessCheck: false })
)

export const GET = handler.GET
export const POST = handler.POST
