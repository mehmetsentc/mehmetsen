import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runAaContentWorker } from '@/services/newsroom/workers/aaContentWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('aa-content', runAaContentWorker)

export const GET = handler.GET
export const POST = handler.POST
