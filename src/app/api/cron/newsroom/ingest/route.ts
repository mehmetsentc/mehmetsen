import { NextResponse } from 'next/server'
import { createNewsroomCronHandler, newsroomCronConfig } from '@/app/api/cron/newsroom/_shared'
import { processNewsQueue } from '@/services/newsroom/queue/queueProcessor'
import { runBreakingWorker } from '@/services/newsroom/workers/breakingWorker'
import { runLocalWorker } from '@/services/newsroom/workers/localWorker'
import { runNationalWorker } from '@/services/newsroom/workers/nationalWorker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

/** @deprecated Use individual worker crons. Runs breaking + national + local + queue processor. */
async function runLegacyIngest() {
  const breaking = await runBreakingWorker()
  const national = await runNationalWorker()
  const local = await runLocalWorker()
  const queue = await processNewsQueue()

  const queued = breaking.itemsNew + national.itemsNew + local.itemsNew

  return {
    startedAt: new Date().toISOString(),
    deprecated: true,
    message: 'Use /api/cron/newsroom/{breaking,national,local,process-queue} instead',
    breaking,
    national,
    local,
    queue,
    totals: {
      sourcesChecked:
        breaking.sourcesChecked + national.sourcesChecked + local.sourcesChecked,
      itemsFetched: breaking.itemsFetched + national.itemsFetched + local.itemsFetched,
      itemsNew: queued,
      itemsQueued: queued,
      autoPublished: queue.published + queue.updated,
      draftsCreated: queue.drafted,
      itemsSkipped:
        breaking.itemsSkipped + national.itemsSkipped + local.itemsSkipped + queue.skipped,
      itemsFailed: queue.failed + queue.deadLetter,
      errors: [...breaking.errors, ...national.errors, ...local.errors, ...queue.errors],
    },
  }
}

const handler = createNewsroomCronHandler('ingest', runLegacyIngest)

export const GET = handler.GET
export const POST = handler.POST

export async function OPTIONS() {
  return NextResponse.json({ ok: true })
}
