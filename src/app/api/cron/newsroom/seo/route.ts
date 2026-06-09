import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runSeoMaintenanceWorker } from '@/services/newsroom/seoMaintenanceWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('seo', runSeoMaintenanceWorker)

export const GET = handler.GET
export const POST = handler.POST
