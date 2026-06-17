import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runAnkaBreakingWorker } from '@/services/newsroom/workers/ankaBreakingWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const handler = createNewsroomCronHandler('anka-breaking', runAnkaBreakingWorker)

export const GET = handler.GET
export const POST = handler.POST
