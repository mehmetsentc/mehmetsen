import { NextResponse } from 'next/server'
import { isNewsroomAuthorized } from '@/lib/newsroomAuth'
import { isGlobalCrawlerEnabled } from '@/services/crawler/enabled'
import { DrizzleCrawlerStore, canUseDrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { MemoryCrawlerStore } from '@/services/crawler/store/memory'
import {
  DrizzleAiDispatchStore,
  canUseDrizzleAiDispatchStore,
} from '@/services/crawler/aiDispatch/drizzleStore'
import { MemoryAiDispatchStore } from '@/services/crawler/aiDispatch/store'
import { runDedicatedAiWorkerTick } from '@/services/crawler/autoDraft/worker'
import { recoverStaleLeases } from '@/services/crawler/autoDraft/pipeline'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
/** One DeepSeek request + finalize — dedicated worker, not crawler tick. */
export const maxDuration = 120

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
        claimed: 0,
        providerCalls: 0,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const crawlerStore = canUseDrizzleCrawlerStore()
    ? new DrizzleCrawlerStore()
    : new MemoryCrawlerStore()
  const aiStore = canUseDrizzleAiDispatchStore()
    ? new DrizzleAiDispatchStore()
    : new MemoryAiDispatchStore()

  const now = new Date()
  const recoverReasons: Record<string, number> = {}
  const leaseRecovered = await recoverStaleLeases(aiStore, now, recoverReasons)

  const result = await runDedicatedAiWorkerTick({
    crawlerStore,
    aiStore,
    now,
  })

  return NextResponse.json(
    {
      ...result,
      leaseRecovered,
      recoverReasons,
      published: 0,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export const GET = handle
export const POST = handle
