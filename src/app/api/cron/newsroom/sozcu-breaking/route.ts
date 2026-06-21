import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runSozcuBreakingWorker } from '@/services/newsroom/sozcuBreakingWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('sozcu-breaking', runSozcuBreakingWorker)

export const GET = handler.GET
export const POST = handler.POST
