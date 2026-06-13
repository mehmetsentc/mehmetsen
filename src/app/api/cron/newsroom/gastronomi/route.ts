import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runGastronomyWorker } from '@/services/newsroom/workers/gastronomyWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('gastronomi', runGastronomyWorker)

export const GET = handler.GET
export const POST = handler.POST
