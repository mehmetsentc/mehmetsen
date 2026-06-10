import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runMagazineWorker } from '@/services/newsroom/workers/magazineWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('magazine', runMagazineWorker)

export const GET = handler.GET
export const POST = handler.POST
