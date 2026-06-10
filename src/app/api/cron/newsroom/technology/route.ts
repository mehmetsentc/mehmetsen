import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runTechWorker } from '@/services/newsroom/workers/techWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('technology', runTechWorker)

export const GET = handler.GET
export const POST = handler.POST
