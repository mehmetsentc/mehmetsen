import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runAnkaLocalWorker } from '@/services/newsroom/workers/ankaLocalWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('anka-local', runAnkaLocalWorker)

export const GET = handler.GET
export const POST = handler.POST
