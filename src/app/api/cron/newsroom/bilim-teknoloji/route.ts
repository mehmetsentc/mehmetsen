import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runBilimTeknolojiWorker } from '@/services/newsroom/bilimTeknolojiWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('bilim-teknoloji-sozcu', runBilimTeknolojiWorker)

export const GET = handler.GET
export const POST = handler.POST
