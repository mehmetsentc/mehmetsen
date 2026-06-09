import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runAfadWorker } from '@/services/newsroom/afadWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const handler = createNewsroomCronHandler('afad-deprem', runAfadWorker)

export const GET = handler.GET
export const POST = handler.POST
