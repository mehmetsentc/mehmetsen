import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runBorsaWorker } from '@/services/newsroom/borsaWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('borsa', runBorsaWorker)

export const GET = handler.GET
export const POST = handler.POST
