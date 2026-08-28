import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { hasDatabaseUrl } from '@/db'
import { feedService } from '@/services/feed/FeedService'
import { userFeatureAccessService } from '@/services/user/userFeatureAccessService'
import type { FeedMode } from '@/types/smartFeed'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MODES: FeedMode[] = ['personal', 'breaking', 'following', 'local']

export async function GET(request: Request) {
  const auth =
    (await verifyCmsToken(request, 'system:settings')) ||
    (await verifyCmsToken(request, 'algorithm:view')) ||
    (await verifyCmsToken(request, 'news:read'))

  if (!auth) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!hasDatabaseUrl()) {
    return NextResponse.json({ error: 'Database unavailable' }, { status: 503 })
  }

  const url = new URL(request.url)
  const targetUserId = url.searchParams.get('userId')?.trim() || 'ap3scBglLIVwflfZN4qL8PKrM1A3'
  const modeParam = url.searchParams.get('mode')?.trim().toLowerCase() as FeedMode
  const selectedMode: FeedMode = MODES.includes(modeParam) ? modeParam : 'personal'
  const limitParam = Math.min(50, Math.max(1, parseInt(url.searchParams.get('limit') || '30', 10)))

  const startTime = performance.now()
  const feedResult = await feedService.getFeed({
    userId: targetUserId,
    sessionId: null,
    mode: selectedMode,
    limit: limitParam,
    refresh: true,
  }, { debug: true })
  const latencyMs = parseFloat((performance.now() - startTime).toFixed(2))

  const items = feedResult.items || []

  // Hard Quality Gates
  let missingTitles = 0
  let placeholderCount = 0
  let testPublisherCount = 0
  let missingSlugs = 0
  let missingMedia = 0
  let missingSummary = 0

  const processedItems = items.map((item, index) => {
    const ageHours = parseFloat(
      ((Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60)).toFixed(2)
    )
    const hasHeadline = Boolean(item.headline && item.headline.trim().length > 5)
    const hasSummary = Boolean(item.summary && item.summary.trim().length > 0)
    const hasMedia = Boolean(item.image || item.video)
    const hasSlug = Boolean(item.slug && item.slug.trim().length > 0)
    const isPlaceholder = /lorem|test|dummy|sample/i.test(item.headline)
    const isTestPublisher = /test|mock/i.test(item.publisher?.name ?? '')

    if (!hasHeadline) missingTitles++
    if (isPlaceholder) placeholderCount++
    if (isTestPublisher) testPublisherCount++
    if (!hasSlug) missingSlugs++
    if (!hasMedia) missingMedia++
    if (!hasSummary) missingSummary++

    return {
      position: index + 1,
      articleId: item.articleId,
      headline: item.headline,
      summary: item.summary,
      publisher: item.publisher?.name ?? 'UNKNOWN',
      publisherSlug: item.publisher?.slug ?? 'unknown',
      category: item.category ?? 'general',
      clusterId: item.clusterId,
      ageHours,
      reason: item.reason,
      score: item.scoreBreakdown?.total ?? 0,
      breaking: item.breaking,
      materialUpdate: item.materialUpdate,
      clusterSourceCount: item.clusterSourceCount,
      hasMedia,
      slug: item.slug,
      scoreBreakdown: item.scoreBreakdown,
    }
  })

  // Cluster Dedup Stats
  const clusterIds = items.map((i) => i.clusterId).filter(Boolean) as string[]
  const uniqueClusters = new Set(clusterIds).size
  const clusterDuplicates = clusterIds.length - uniqueClusters

  // Publisher Diversity
  const publisherCounts: Record<string, number> = {}
  for (const it of items) {
    const pubName = it.publisher?.name ?? 'UNKNOWN'
    publisherCounts[pubName] = (publisherCounts[pubName] || 0) + 1
  }
  const uniquePublishers = Object.keys(publisherCounts).length
  const topPublisherShare = items.length > 0
    ? parseFloat(((Math.max(...Object.values(publisherCounts)) / items.length) * 100).toFixed(1))
    : 0

  let maxConsecutivePublisher = 1
  let currentRun = 1
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1].publisher?.name ?? 'UNKNOWN'
    const curr = items[i].publisher?.name ?? 'UNKNOWN'
    if (prev === curr) {
      currentRun++
      if (currentRun > maxConsecutivePublisher) maxConsecutivePublisher = currentRun
    } else {
      currentRun = 1
    }
  }

  // Category Diversity
  const categoryCounts: Record<string, number> = {}
  for (const it of items) {
    const cat = it.category ?? 'general'
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1
  }
  const uniqueCategories = Object.keys(categoryCounts).length

  // Freshness Stats
  const ages = processedItems.map((i) => i.ageHours).sort((a, b) => a - b)
  const medianAge = ages.length > 0 ? ages[Math.floor(ages.length / 2)] : 0
  const p90Age = ages.length > 0 ? ages[Math.floor(ages.length * 0.9)] : 0

  const freshnessBuckets = {
    '0-1h': ages.filter((a) => a <= 1).length,
    '1-3h': ages.filter((a) => a > 1 && a <= 3).length,
    '3-6h': ages.filter((a) => a > 3 && a <= 6).length,
    '6-12h': ages.filter((a) => a > 6 && a <= 12).length,
    '12-24h': ages.filter((a) => a > 12 && a <= 24).length,
    '24-48h': ages.filter((a) => a > 24 && a <= 48).length,
    '48h+': ages.filter((a) => a > 48).length,
  }

  // User Feature Access
  const userFeatures = await userFeatureAccessService.listRows(targetUserId)

  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    query: {
      userId: targetUserId,
      mode: selectedMode,
      limit: limitParam,
    },
    performance: {
      latencyMs,
      itemCount: items.length,
      rankingVersion: feedResult.rankingVersion ?? 'v1',
      emptyReason: feedResult.emptyReason,
    },
    qualityGates: {
      passed: missingTitles === 0 && placeholderCount === 0 && testPublisherCount === 0 && missingSlugs === 0,
      missingTitles,
      placeholderCount,
      testPublisherCount,
      missingSlugs,
      missingMedia,
      missingSummary,
    },
    clusterStats: {
      uniqueArticles: items.length,
      uniqueClusters,
      clusterDuplicates,
    },
    publisherDiversity: {
      uniquePublishers,
      topPublisherSharePercent: topPublisherShare,
      maxConsecutiveRuns: maxConsecutivePublisher,
      distribution: publisherCounts,
    },
    categoryDiversity: {
      uniqueCategories,
      distribution: categoryCounts,
    },
    freshness: {
      medianAgeHours: medianAge,
      p90AgeHours: p90Age,
      buckets: freshnessBuckets,
    },
    userFeatures,
    items: processedItems,
  })
}
