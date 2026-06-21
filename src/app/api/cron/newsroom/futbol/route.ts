import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runFutbolWorker } from '@/services/newsroom/futbolWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('futbol-sozcu', runFutbolWorker)

export const GET = handler.GET
export const POST = handler.POST
