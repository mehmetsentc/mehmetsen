import { NextResponse, after } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'

export const newsroomCronConfig = {
  runtime: 'nodejs' as const,
  dynamic: 'force-dynamic' as const,
  maxDuration: 300,
}

const NO_DRAIN_LABELS = new Set([
  'process-queue',
  'queue-purge',
  'draft-reprocess',
  'expire-breaking',
])

function ingestEnqueuedItems(result: unknown): number {
  if (!result || typeof result !== 'object') return 0
  const row = result as { itemsNew?: unknown }
  return typeof row.itemsNew === 'number' && row.itemsNew > 0 ? row.itemsNew : 0
}

function scheduleQueueDrain(label: string, result: unknown) {
  if (NO_DRAIN_LABELS.has(label)) return
  const enqueued = ingestEnqueuedItems(result)
  if (enqueued <= 0) return

  after(async () => {
    try {
      const { processNewsQueue } = await import('@/services/newsroom/queue/queueProcessor')
      const drain = await processNewsQueue(undefined, Math.min(40, Math.max(12, enqueued + 8)))
      console.log(
        `[cron:drain] after ${label}: picked=${drain.picked} pub=${drain.published}` +
          ` skip=${drain.skipped} draft=${drain.drafted}`
      )
    } catch (error) {
      console.error(
        `[cron:drain] after ${label} failed:`,
        error instanceof Error ? error.message : error
      )
    }
  })
}

export function createNewsroomCronHandler<T>(
  label: string,
  run: () => Promise<T>
) {
  let inFlight: Promise<T> | null = null

  async function handleRun(request: Request) {
    if (!(await isNewsroomAuthorized(request))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const startedAt = Date.now()
    // COST PAUSE: cronRuns Firestore logging disabled — logs go to Vercel console instead.
    console.log(`[cron:start] ${label}`)

    try {
      if (!inFlight) {
        inFlight = run().finally(() => {
          inFlight = null
        })
      }
      const result = await inFlight

      scheduleQueueDrain(label, result)
      console.log(`[cron:done] ${label} durationMs=${Date.now() - startedAt}`)
      return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`CRON_FAIL[${label}]: ${message}`)
      if (error instanceof Error && error.stack) {
        console.error('CRON_STACK:', error.stack.slice(0, 500))
      }
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  return {
    GET: handleRun,
    POST: handleRun,
  }
}
