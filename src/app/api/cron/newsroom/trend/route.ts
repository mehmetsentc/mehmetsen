import { createNewsroomCronHandler, newsroomCronConfig } from '@/app/api/cron/newsroom/_shared'
import { runTrendWorker } from '@/services/newsroom/workers/trendWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('trend', runTrendWorker)

export const GET = handler.GET
export const POST = handler.POST
