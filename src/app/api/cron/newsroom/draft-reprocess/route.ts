/**
 * GET /api/cron/newsroom/draft-reprocess
 *
 * pending_review newsDrafts → AI yeniden yazım/gate → geçerse otomatik yayın.
 * Her 10 dakikada bir çalışır.
 */
import { createNewsroomCronHandler, newsroomCronConfig } from '@/app/api/cron/newsroom/_shared'
import { reprocessPendingDrafts } from '@/services/newsroom/draftReprocessService'

export const runtime = newsroomCronConfig.runtime
export const dynamic = newsroomCronConfig.dynamic
export const maxDuration = 300

const handler = createNewsroomCronHandler('draft-reprocess', reprocessPendingDrafts)

export const GET = handler
export const POST = handler
