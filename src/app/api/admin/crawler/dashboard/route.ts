import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { isGlobalCrawlerEnabled } from '@/services/crawler/enabled'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { crawlerDashboardSnapshot } from '@/services/crawler/telemetry'
import { readCrawlerOpsState, refreshRebuildProgress } from '@/services/crawler/ops/opsPersist'
import { REBUILD_STATUS_TR } from '@/services/crawler/ops/opsState'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!hasDatabaseUrl()) {
    return NextResponse.json({
      enabled: isGlobalCrawlerEnabled(),
      postgres: false,
      error: 'DATABASE_URL missing',
    })
  }

  const store = new DrizzleCrawlerStore()
  const snapshot = await crawlerDashboardSnapshot(store)
  let ops = await readCrawlerOpsState(store)
  if (ops.rebuildStatus !== 'IDLE' && ops.rebuildStatus !== 'ERROR') {
    ops = await refreshRebuildProgress(store)
  }
  return NextResponse.json({
    postgres: true,
    ...snapshot,
    rebuild24h: {
      status: ops.rebuildStatus,
      statusTr: REBUILD_STATUS_TR[ops.rebuildStatus],
      maintenanceMode: ops.maintenanceMode,
      cutoffAt: ops.cutoffAt,
      rebuildStartedAt: ops.rebuildStartedAt,
      discovered: ops.discovered,
      pending: ops.pending,
      extracted: ops.extracted,
      failed: ops.failed,
      events: ops.events,
      multiSource: ops.multiSource,
      windowHours: ops.rebuildWindowHours,
    },
  })
}
