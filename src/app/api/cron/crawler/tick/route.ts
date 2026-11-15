import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { isGlobalCrawlerEnabled } from '@/services/crawler/enabled'
import { runCrawlerTick } from '@/services/crawler/workers/tick'
import { shouldSkipNightTick } from '@/services/crawler/ops/nightCadence'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Crawler-only: discover/extract/cluster/enqueue. Paid AI is /api/cron/crawler-ai-worker.
 *  CRAWL-CADENCE-1: every 30 min; 300s covers the 240s tick (fetch + cluster + media). */
export const maxDuration = 300

async function handle(request: Request) {
  if (!(await isNewsroomAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isGlobalCrawlerEnabled()) {
    return NextResponse.json(
      {
        enabled: false,
        skipped: true,
        reason: 'GLOBAL_CRAWLER_ENABLED=false',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  // FinOps: hourly at night (01:00–05:59 TR); ?force=1 bypasses.
  const force = new URL(request.url).searchParams.get('force') === '1'
  if (!force && shouldSkipNightTick(new Date())) {
    return NextResponse.json(
      { enabled: true, skipped: true, reason: 'NIGHT_CADENCE' },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const result = await runCrawlerTick()
  // SEO-15 / INDEXNOW-1: new indexable stories → Bing/Yandex. Never fails the tick.
  let indexNow: { submitted: number; skipped?: string } | { error: string }
  try {
    const { submitFreshNewsToIndexNow } = await import('@/lib/seo/indexNowBatch')
    indexNow = await submitFreshNewsToIndexNow()
  } catch (err) {
    indexNow = { error: err instanceof Error ? err.message.slice(0, 120) : 'failed' }
    console.warn('[indexnow-batch] failed', indexNow.error)
  }
  return NextResponse.json({ ...result, indexNow }, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = handle
export const POST = handle
