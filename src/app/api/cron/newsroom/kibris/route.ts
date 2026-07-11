import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runKibrisWorker } from '@/services/newsroom/workers/kibrisWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('kibris-haberleri', runKibrisWorker)

export const GET = handler.GET
export const POST = handler.POST
