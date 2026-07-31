/**
 * GET /api/cron/newsroom/draft-reprocess
 *
 * pending_review newsDrafts → AI yeniden yazım/gate → geçerse otomatik yayın.
 * Her 10 dakikada bir çalışır.
 */
import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { reprocessPendingDrafts } from '@/services/newsroom/draftReprocessService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('draft-reprocess', reprocessPendingDrafts)

export const GET = handler.GET
export const POST = handler.POST
