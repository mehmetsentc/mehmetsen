import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runFinansWorker } from '@/services/newsroom/finansWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('finans', runFinansWorker)

export const GET = handler.GET
export const POST = handler.POST
