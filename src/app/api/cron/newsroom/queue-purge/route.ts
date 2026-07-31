import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { purgeStaleQueueItems } from '@/services/newsroom/queue/purgeStaleQueue'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('queue-purge', () => purgeStaleQueueItems())

export const GET = handler.GET
export const POST = handler.POST
