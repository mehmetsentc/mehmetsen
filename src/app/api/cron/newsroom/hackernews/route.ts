import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { runHackerNewsWorker } from '@/services/newsroom/workers/hackerNewsWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const handler = createNewsroomCronHandler('hackernews', runHackerNewsWorker)

export const GET = handler.GET
export const POST = handler.POST
