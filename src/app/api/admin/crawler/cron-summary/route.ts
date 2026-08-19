import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { isGlobalCrawlerEnabled } from '@/services/crawler/enabled'
import { buildCrawlerCronSummaries, historyWindow } from '@/services/crawler/ops/cronSummary'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'cron:read')
  if (!auth) {
    const fallback = await verifyCmsToken(request, 'news:read')
    if (!fallback) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({
      postgres: false,
      crawlerEnabled: isGlobalCrawlerEnabled(),
      jobs: [],
      history: { last24h: 0, last7d: 0 },
    })
  }

  const store = new DrizzleCrawlerStore()
  const metrics = await store.getTodayMetrics()
  const sources = await store.listSources()
  const lastDiscovery = sources.reduce<Date | null>((max, s) => {
    const v = s.lastSuccessfulDiscoveryAt
    if (!v) return max
    const d = v instanceof Date ? v : new Date(v)
    return !max || d > max ? d : max
  }, null)

  const jobs = buildCrawlerCronSummaries({
    enabled: isGlobalCrawlerEnabled(),
    metrics,
    lastDiscoveryAt: lastDiscovery,
    lastExtractionAt: lastDiscovery,
  })

  const url = new URL(request.url)
  const window = url.searchParams.get('window') === '7d' ? 7 : 1
  const history = historyWindow(
    jobs
      .filter((j) => j.lastRunAt)
      .map((j) => ({ startedAt: new Date(j.lastRunAt as string).getTime() })),
    Date.now()
  )

  return NextResponse.json({
    postgres: true,
    crawlerEnabled: isGlobalCrawlerEnabled(),
    jobs,
    history,
    windowDays: window,
    source: 'crawler_metrics_daily + news_sources',
  })
}
