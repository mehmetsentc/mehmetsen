import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { paginateSlice } from '@/services/crawler/editorial/query'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface YieldRow {
  discoveredUrls: number
  rawArticles: number
  duplicates: number
  primaryMemberships: number
  totalMemberships: number
}

function yieldSummary(row?: YieldRow) {
  const r: YieldRow = row || {
    discoveredUrls: 0,
    rawArticles: 0,
    duplicates: 0,
    primaryMemberships: 0,
    totalMemberships: 0,
  }
  return {
    discoveredUrls: r.discoveredUrls,
    rawArticles: r.rawArticles,
    duplicateRate: r.rawArticles > 0 ? Number((r.duplicates / r.rawArticles).toFixed(2)) : null,
    uniqueRate: r.totalMemberships > 0 ? Number((r.primaryMemberships / r.totalMemberships).toFixed(2)) : null,
  }
}

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  const store = new DrizzleCrawlerStore()
  const sources = await store.listSources()
  const metrics = await store.getTodayMetrics()
  const articles = await store.listRecentArticles(200)
  const [yield7, yield30] = await Promise.all([store.getSourceYield(7), store.getSourceYield(30)])
  const url = new URL(request.url)
  const all = sources.map((s) => {
    const mined = articles.filter((a) => a.sourceId === s.id)
    const lastExtract = mined[0]?.fetchedAt || null
    const avgConf =
      mined.length > 0
        ? mined.reduce((n, a) => n + (a.extractionConfidence || 0), 0) / mined.length
        : 0
    return {
      id: s.id,
      name: s.name,
      status: s.status,
      healthScore: s.healthScore,
      lastSuccessfulDiscoveryAt: s.lastSuccessfulDiscoveryAt,
      lastSuccessfulExtractionAt: lastExtract,
      consecutiveFailures: s.consecutiveFailures,
      extractionSuccessRate: s.extractionSuccessRate,
      averageConfidence: Number(avgConf.toFixed(2)),
      qualityTier: s.qualityTier,
      yield7d: yieldSummary(yield7.get(s.id)),
      yield30d: yieldSummary(yield30.get(s.id)),
    }
  })
  const page = paginateSlice(all, Number(url.searchParams.get('page') || '1'), Number(url.searchParams.get('pageSize') || '25'))
  return NextResponse.json({
    http429: metrics.http_429 || 0,
    total: page.total,
    page: page.page,
    pageSize: page.pageSize,
    totalPages: page.totalPages,
    sources: page.items,
  })
}
