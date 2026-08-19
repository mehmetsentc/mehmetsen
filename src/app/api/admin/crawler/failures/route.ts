import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { DrizzleCrawlerStore } from '@/services/crawler/store/drizzle'
import { classifyCrawlerFailure, FAILURE_CLASS_LABELS } from '@/services/crawler/failures/classify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, 'news:read')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasDatabaseUrl()) return NextResponse.json({ error: 'DATABASE_URL missing' }, { status: 503 })
  const store = new DrizzleCrawlerStore()
  const failedUrls = await store.listFailedUrls(80)
  const sources = await store.listSources()
  const sourceById = new Map(sources.map((s) => [s.id, s]))
  const discoveryFailures = sources
    .filter((s) => s.consecutiveFailures > 0 || s.status === 'DEGRADED' || s.status === 'PAUSED')
    .map((s) => ({
      source: s.name,
      status: s.status,
      consecutiveFailures: s.consecutiveFailures,
      lastPauseReason: s.lastPauseReason,
      reasonLabel: FAILURE_CLASS_LABELS[classifyCrawlerFailure({ failureReason: s.lastPauseReason, status: s.status })],
      lastDiscoveryAt: s.lastDiscoveryAt,
      nextDiscoveryAt: s.nextDiscoveryAt,
    }))
  const articles = await store.listRecentArticles(120)
  const extractionFailures = articles
    .filter((a) => a.qualityStatus === 'FAILED' || a.qualityStatus === 'LOW_CONFIDENCE')
    .map((a) => ({
      source: sourceById.get(a.sourceId)?.name || a.sourceId,
      url: a.canonicalUrl || a.originalUrl,
      qualityStatus: a.qualityStatus,
      reasonLabel: FAILURE_CLASS_LABELS[classifyCrawlerFailure({ qualityStatus: a.qualityStatus, httpStatus: a.httpStatus })],
      httpStatus: a.httpStatus,
      confidence: a.extractionConfidence,
    }))
  return NextResponse.json({
    discoveryFailures,
    httpFailures: failedUrls.map((u) => ({
      source: sourceById.get(u.sourceId)?.name || u.sourceId,
      url: u.normalizedUrl,
      error: u.failureReason,
      reasonLabel: FAILURE_CLASS_LABELS[classifyCrawlerFailure({ failureReason: u.failureReason, status: u.status })],
      status: u.status,
      attempts: u.fetchAttempts,
      lastAttempt: u.lastFetchAttempt,
    })),
    extractionFailures,
    clusteringFailures: [],
  })
}
