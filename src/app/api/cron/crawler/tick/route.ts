import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { isGlobalCrawlerEnabled } from '@/services/crawler/enabled'
import { runCrawlerTick } from '@/services/crawler/workers/tick'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** Crawler-only: discover/extract/cluster/enqueue. Paid AI is /api/cron/crawler-ai-worker.
 *  300s so a 20-minute cron can cover the due source fleet without a 60s 504. */
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

  const result = await runCrawlerTick()
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}

export const GET = handle
export const POST = handle
