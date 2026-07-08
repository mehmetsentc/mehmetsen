import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runThinContentBackfillWorker } from '@/services/newsroom/thinContentBackfillWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('thin-content-backfill', runThinContentBackfillWorker)

export const GET = handler.GET
export const POST = handler.POST
