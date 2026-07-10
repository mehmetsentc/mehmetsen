import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runTurizmWorker } from '@/services/newsroom/workers/turizmWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('turizm', runTurizmWorker)

export const GET = handler.GET
export const POST = handler.POST
