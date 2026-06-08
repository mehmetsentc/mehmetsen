import { createNewsroomCronHandler, newsroomCronConfig } from '@/app/api/cron/newsroom/_shared'
import { runNationalWorker } from '@/services/newsroom/workers/nationalWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('national', runNationalWorker)

export const GET = handler.GET
export const POST = handler.POST
