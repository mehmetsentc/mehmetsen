import { createNewsroomCronHandler } from '@/app/api/cron/newsroom/_shared'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { processNewsQueue } from '@/services/newsroom/queue/queueProcessor'

/** Vercel cron every 2 min — drain pending queue newest-first until empty or time budget. */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const handler = createNewsroomCronHandler('process-queue', async () => {
  const db = getAdminFirestore()
  const { isLegacyDirectAiEnabled } = await import('@/services/crawler/legacyFlags')
  if (!isLegacyDirectAiEnabled()) {
    return {
      mode: 'legacy_disabled' as const,
      aiRequests: 0 as const,
      rounds: 0,
      picked: 0,
      published: 0,
      drafted: 0,
      skipped: 0,
      failed: 0,
      elapsedMs: 0,
    }
  }
  const started = Date.now()
  const totals = {
    rounds: 0,
    picked: 0,
    published: 0,
    drafted: 0,
    skipped: 0,
    failed: 0,
  }

  for (let i = 0; i < 8; i++) {
    if (Date.now() - started > 270_000) break
    const result = await processNewsQueue(db, 40, { skipFreshnessCheck: false })
    totals.rounds += 1
    totals.picked += result.picked
    totals.published += result.published
    totals.drafted += result.drafted
    totals.skipped += result.skipped
    totals.failed += result.failed
    if (result.picked === 0) break
  }

  return { ...totals, elapsedMs: Date.now() - started }
})

export const GET = handler.GET
export const POST = handler.POST
