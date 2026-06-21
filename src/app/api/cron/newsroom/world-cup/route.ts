import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runWorldCupWorker } from '@/services/newsroom/worldCupWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('world-cup-2026', runWorldCupWorker)

export const GET = handler.GET
export const POST = handler.POST
