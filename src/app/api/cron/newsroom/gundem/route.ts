import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runGundemWorker } from '@/services/newsroom/workers/gundemWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('gundem', runGundemWorker)

export const GET = handler.GET
export const POST = handler.POST
