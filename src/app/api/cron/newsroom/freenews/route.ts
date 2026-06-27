import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runFreeNewsApiWorker } from '@/services/newsroom/workers/freeNewsApiWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('freenews', runFreeNewsApiWorker)

export const GET = handler.GET
export const POST = handler.POST
