import { createNewsroomCronHandler, newsroomCronConfig } from '@/app/api/cron/newsroom/_shared'
import { purgeStaleQueueItems } from '@/services/newsroom/queue/purgeStaleQueue'

export const runtime = newsroomCronConfig.runtime
export const dynamic = newsroomCronConfig.dynamic
export const maxDuration = newsroomCronConfig.maxDuration

const handler = createNewsroomCronHandler('queue-purge', () => purgeStaleQueueItems())

export const GET = handler.GET
export const POST = handler.POST
