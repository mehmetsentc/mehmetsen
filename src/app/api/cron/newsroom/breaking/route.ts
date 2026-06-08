import { createNewsroomCronHandler, newsroomCronConfig } from '@/app/api/cron/newsroom/_shared'
import { runBreakingWorker } from '@/services/newsroom/workers/breakingWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('breaking', runBreakingWorker)

export const GET = handler.GET
export const POST = handler.POST
