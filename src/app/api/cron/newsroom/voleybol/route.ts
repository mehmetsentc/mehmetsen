import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runVoleybolWorker } from '@/services/newsroom/voleybolWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('voleybol', runVoleybolWorker)

export const GET = handler.GET
export const POST = handler.POST
