import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runGeziWorker } from '@/services/newsroom/workers/geziWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('gezi', runGeziWorker)

export const GET = handler.GET
export const POST = handler.POST
