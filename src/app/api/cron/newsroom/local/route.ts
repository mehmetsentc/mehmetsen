import { createNewsroomCronHandler, newsroomCronConfig } from '@/app/api/cron/newsroom/_shared'
import { runLocalWorker } from '@/services/newsroom/workers/localWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('local', runLocalWorker)

export const GET = handler.GET
export const POST = handler.POST
