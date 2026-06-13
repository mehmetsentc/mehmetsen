import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runOtomobilWorker } from '@/services/newsroom/workers/otomobilWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('otomobil', runOtomobilWorker)

export const GET = handler.GET
export const POST = handler.POST
