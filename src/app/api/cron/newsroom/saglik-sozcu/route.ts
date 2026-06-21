import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runSaglikSozcuWorker } from '@/services/newsroom/saglikWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('saglik-sozcu', runSaglikSozcuWorker)

export const GET = handler.GET
export const POST = handler.POST
