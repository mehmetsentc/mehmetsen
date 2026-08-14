import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runCanakkaleBelDuyuruWorker } from '@/services/newsroom/workers/canakkaleBelDuyuruWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('canakkale-bel-duyuru', runCanakkaleBelDuyuruWorker)

export const GET = handler.GET
export const POST = handler.POST
