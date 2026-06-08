import { createNewsroomCronHandler, newsroomCronConfig } from '@/app/api/cron/newsroom/_shared'
import { runInfluencerWorker } from '@/services/newsroom/workers/influencerWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('influencer', runInfluencerWorker)

export const GET = handler.GET
export const POST = handler.POST
