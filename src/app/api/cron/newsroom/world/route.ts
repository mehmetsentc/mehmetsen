import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runWorldWorker } from '@/services/newsroom/workers/worldWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('world-news', runWorldWorker)

export const GET = handler.GET
export const POST = handler.POST
