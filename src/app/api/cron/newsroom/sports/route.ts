import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runSportsWorker } from '@/services/newsroom/workers/sportsWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('sports-news', runSportsWorker)

export const GET = handler.GET
export const POST = handler.POST
