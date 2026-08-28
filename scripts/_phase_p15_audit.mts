/**
 * Phase P15 — Smart Feed Quality, Relevance & Pilot Analytics Audit
 *
 * Usage: npx tsx scripts/_phase_p15_audit.mts
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { createRequire } from 'node:module'

{
  const require = createRequire(import.meta.url)
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  const stubFile = resolve(stubDir, 'index.js')
  if (!existsSync(stubFile)) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(stubFile, 'module.exports = {};\n')
    writeFileSync(
      resolve(stubDir, 'package.json'),
      JSON.stringify({ name: 'server-only', main: 'index.js' })
    )
  }
  void require
}

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const i = line.indexOf('=')
    const k = line.slice(0, i).trim()
    let v = line.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!(k in process.env)) process.env[k] = v
  }
}

loadEnvLocal()
process.env.NEXT_PUBLIC_APP_URL = 'https://www.nahaber.com'
process.env.VERCEL_ENV = 'production'
process.env.NODE_ENV = 'production'

const FLAG_KEYS = [
  'PUBLISHER_PLATFORM_ENABLED',
  'PUBLISHER_STUDIO_ENABLED',
  'PUBLISHER_PROFILE_COMPOSER_ENABLED',
  'PUBLISHER_CONTENT_STUDIO_ENABLED',
  'PUBLISHER_MANUAL_PUBLISH_ENABLED',
  'PUBLISHER_SCHEDULING_ENABLED',
  'PUBLISHER_MEDIA_UPLOAD_ENABLED',
  'PUBLISHER_AD_INVENTORY_ENABLED',
  'PUBLISHER_AD_PUBLIC_LISTING_ENABLED',
  'PROFILE_AD_SLOTS_ENABLED',
  'ARTICLE_AD_SLOTS_ENABLED',
  'PUBLISHER_SELF_MANAGED_ADS_ENABLED',
  'PUBLISHER_AD_SERVING_ENABLED',
  'PUBLISHER_VIDEO_PREROLL_ENABLED',
  'PUBLISHER_AD_ANALYTICS_ENABLED',
  'SMART_FEED_ENABLED',
  'SMART_FEED_RANKING_V1_ENABLED',
  'SOCIAL_GRAPH_ENABLED',
  'USER_PROFILES_ENABLED',
  'ADVERTISER_PLATFORM_ENABLED',
  'AD_MARKETPLACE_ENABLED',
  'COMMERCIAL_LEDGER_ENABLED',
  'PAYMENT_INTENT_ENABLED',
  'PUBLISHER_EARNINGS_ENABLED',
]

for (const k of FLAG_KEYS) {
  process.env[k] = 'false'
}

async function runAudit() {
  const { neon } = await import('@neondatabase/serverless')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  const pilotUid = 'ap3scBglLIVwflfZN4qL8PKrM1A3'
  console.log('--- Phase P15 Audit Started ---')

  // 1. Production Baseline
  const healthRes = await sql`SELECT 1 as alive, version()`
  const flagsInEnv = FLAG_KEYS.map((k) => ({ key: k, val: process.env[k] }))
  const ufaRows = await sql`SELECT * FROM user_feature_access WHERE user_id = ${pilotUid}`
  const pubRows = await sql`
    SELECT id, slug, name, status, verification_status
    FROM publishers
    WHERE slug IN ('the-guardian-world-rss', 'trt-haber-rss', 'le-monde-rss', 'deutsche-welle-rss', 'bbc-world-rss')
  `
  const claimCount = (await sql`SELECT count(*)::int as c FROM publisher_claim_requests`)[0].c
  const memberCount = (await sql`SELECT count(*)::int as c FROM publisher_members`)[0].c
  const pfaCount = (await sql`SELECT count(*)::int as c FROM publisher_feature_access WHERE enabled = true`)[0].c
  const ledgerCount = (await sql`SELECT count(*)::int as c FROM commercial_ledger_entries`)[0].c
  const campaignCount = (await sql`SELECT count(*)::int as c FROM advertiser_campaigns`)[0].c

  const feedCounts = {
    user_content_impressions: (await sql`SELECT count(*)::int as c FROM user_content_impressions`)[0].c,
    social_events: (await sql`SELECT count(*)::int as c FROM social_events`)[0].c,
    user_interest_scores: (await sql`SELECT count(*)::int as c FROM user_interest_scores`)[0].c,
    user_publisher_affinity: (await sql`SELECT count(*)::int as c FROM user_publisher_affinity`)[0].c,
    user_feed_preferences: (await sql`SELECT count(*)::int as c FROM user_feed_preferences`)[0].c,
    user_feature_access: (await sql`SELECT count(*)::int as c FROM user_feature_access`)[0].c,
  }

  console.log('1. Baseline Captured:', {
    health: healthRes[0],
    ufaCount: ufaRows.length,
    publishers: pubRows,
    claimCount,
    memberCount,
    pfaCount,
    ledgerCount,
    campaignCount,
    feedCounts,
  })

  // 2. Feed Service Ingestion / Ranking Dry-run
  const { feedService } = await import('../src/services/feed/FeedService')
  const { feedRankingPipeline } = await import('../src/services/feed/FeedRankingPipeline')
  const { feedSeenService } = await import('../src/services/feed/FeedSeenService')
  const { feedUserContextService } = await import('../src/services/feed/FeedUserContextService')
  const { feedColdStartService } = await import('../src/services/feed/FeedColdStartService')

  // Run dry-run for 30 cards in personal mode (Sana Özel)
  const t0 = performance.now()
  const personalFeed = await feedService.getFeed({
    userId: pilotUid,
    mode: 'personal',
    limit: 30,
    refresh: true,
  }, { debug: true })
  const t1 = performance.now()
  const personalLatencyMs = t1 - t0

  console.log('Personal Feed Latency:', personalLatencyMs.toFixed(2), 'ms; items returned:', personalFeed.items.length)

  // Quality Gates inspection on first 30 cards
  const items = personalFeed.items
  const audit30 = items.map((item, idx) => {
    const ageHours = (Date.now() - new Date(item.publishedAt).getTime()) / (1000 * 60 * 60)
    const hasHeadline = !!item.headline && item.headline.trim().length > 5
    const hasSummary = !!item.summary && item.summary.trim().length > 0
    const hasMedia = !!item.image || !!item.video
    const hasPublisher = !!item.publisher && !!item.publisher.name
    const hasSlug = !!item.slug && item.slug.trim().length > 0
    const isPlaceholder = /lorem|test|dummy|sample/i.test(item.headline)
    const isTestPublisher = /test|mock/i.test(item.publisher?.name ?? '')

    return {
      pos: idx + 1,
      id: item.articleId,
      headline: item.headline,
      publisher: item.publisher?.name ?? 'UNKNOWN',
      publisherSlug: item.publisher?.slug ?? 'unknown',
      category: item.category ?? 'general',
      clusterId: item.clusterId,
      ageHours: parseFloat(ageHours.toFixed(2)),
      reason: item.reason,
      score: item.scoreBreakdown?.total ?? 0,
      breaking: item.breaking,
      materialUpdate: item.materialUpdate,
      hasHeadline,
      hasSummary,
      hasMedia,
      hasPublisher,
      hasSlug,
      isPlaceholder,
      isTestPublisher,
      scoreBreakdown: item.scoreBreakdown,
    }
  })

  // Quality gate summary
  const missingTitles = audit30.filter((a) => !a.hasHeadline).length
  const placeholderCount = audit30.filter((a) => a.isPlaceholder).length
  const testPublisherCount = audit30.filter((a) => a.isTestPublisher).length
  const missingSlugs = audit30.filter((a) => !a.hasSlug).length
  const missingMedia = audit30.filter((a) => !a.hasMedia).length
  const missingSummary = audit30.filter((a) => !a.hasSummary).length

  console.log('First 30 Quality Gates:', {
    missingTitles,
    placeholderCount,
    testPublisherCount,
    missingSlugs,
    missingMedia,
    missingSummary,
  })

  // Cluster Dedup Analysis
  const uniqueArticles = new Set(audit30.map((a) => a.id)).size
  const clustersNonNull = audit30.map((a) => a.clusterId).filter(Boolean) as string[]
  const uniqueClusters = new Set(clustersNonNull).size
  const clusterRepeatCount = clustersNonNull.length - uniqueClusters

  console.log('Cluster Analysis:', {
    totalItems: audit30.length,
    uniqueArticles,
    uniqueClusters,
    clustersNonNullCount: clustersNonNull.length,
    clusterRepeatCount,
  })

  // Publisher Diversity
  const publisherCounts: Record<string, number> = {}
  for (const a of audit30) {
    publisherCounts[a.publisher] = (publisherCounts[a.publisher] || 0) + 1
  }
  const uniquePublishers = Object.keys(publisherCounts).length
  const topPublisherShare = Math.max(...Object.values(publisherCounts)) / audit30.length

  // Consecutive publisher runs
  let maxConsecutivePublisher = 1
  let currentRun = 1
  for (let i = 1; i < audit30.length; i++) {
    if (audit30[i].publisher === audit30[i - 1].publisher) {
      currentRun++
      if (currentRun > maxConsecutivePublisher) maxConsecutivePublisher = currentRun
    } else {
      currentRun = 1
    }
  }

  console.log('Publisher Diversity:', {
    uniquePublishers,
    topPublisherShare: (topPublisherShare * 100).toFixed(1) + '%',
    publisherCounts,
    maxConsecutivePublisher,
  })

  // Category Diversity
  const categoryCounts: Record<string, number> = {}
  for (const a of audit30) {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1
  }
  const uniqueCategories = Object.keys(categoryCounts).length

  console.log('Category Diversity:', {
    uniqueCategories,
    categoryCounts,
  })

  // Freshness across all 4 modes
  const modes = ['personal', 'breaking', 'following', 'local'] as const
  const modeStats: Record<string, any> = {}

  for (const m of modes) {
    const start = performance.now()
    const res = await feedService.getFeed({
      userId: pilotUid,
      mode: m,
      limit: 30,
      refresh: true,
    })
    const lat = performance.now() - start
    const ages = res.items.map((it) => (Date.now() - new Date(it.publishedAt).getTime()) / (1000 * 60 * 60))
    ages.sort((a, b) => a - b)
    const median = ages.length ? ages[Math.floor(ages.length / 2)] : 0
    const p90 = ages.length ? ages[Math.floor(ages.length * 0.9)] : 0

    const buckets = {
      '0-1h': ages.filter((a) => a <= 1).length,
      '1-3h': ages.filter((a) => a > 1 && a <= 3).length,
      '3-6h': ages.filter((a) => a > 3 && a <= 6).length,
      '6-12h': ages.filter((a) => a > 6 && a <= 12).length,
      '12-24h': ages.filter((a) => a > 12 && a <= 24).length,
      '24-48h': ages.filter((a) => a > 24 && a <= 48).length,
      '48h+': ages.filter((a) => a > 48).length,
    }

    modeStats[m] = {
      count: res.items.length,
      latencyMs: lat.toFixed(2),
      medianAgeHours: median.toFixed(2),
      p90AgeHours: p90.toFixed(2),
      buckets,
      emptyReason: res.emptyReason,
    }
  }

  console.log('Mode Freshness & Latency Stats:', modeStats)

  // Candidate Funnel Analysis
  // Total published news
  const totalPublished = (await sql`SELECT count(*)::int as c FROM news WHERE status = 'published'`)[0].c
  const publishedWithDate = (await sql`SELECT count(*)::int as c FROM news WHERE status = 'published' AND published_at IS NOT NULL`)[0].c
  console.log('Funnel Stats:', {
    totalPublished,
    publishedWithDate,
  })

  // Behavioral Impact Tests (Seen Suppression & Negative Feedback)
  // 1. Seen suppression test
  const testSeenIds = items.slice(0, 5).map((it) => it.articleId)
  const { seenArticles: suppressibleArticles } = await feedSeenService.filterSuppressible(
    null,
    null,
    'personal',
    testSeenIds
  )
  const feedAfterSeen = await feedService.getFeed({
    userId: pilotUid,
    mode: 'personal',
    limit: 30,
    refresh: true,
  })
  // Test ranking pipeline directly with seenArticles set
  const directSuppressed = await feedRankingPipeline.run({
    userId: pilotUid,
    mode: 'personal',
    limit: 30,
    seenArticles: new Set(testSeenIds),
    seenClusters: new Set(),
  })
  const suppressedFoundInDirect = directSuppressed.ranked.filter((r) => testSeenIds.includes(r.articleId))

  console.log('Seen Suppression Verification:', {
    testSeenIds,
    suppressedFoundInDirectCount: suppressedFoundInDirect.length,
  })

  // 2. Negative Feedback Penalty Test
  const { feedScoringService } = await import('../src/services/feed/FeedScoringService')
  const sampleCandidate = items[0]
  // Mock candidate row
  const candidateRow = {
    articleId: sampleCandidate.articleId,
    clusterId: sampleCandidate.clusterId,
    publisherId: sampleCandidate.publisher?.id ?? null,
    publisherSlug: sampleCandidate.publisher?.slug ?? null,
    publisherName: sampleCandidate.publisher?.name ?? null,
    publisherLogoUrl: sampleCandidate.publisher?.logoUrl ?? null,
    publisherVerified: false,
    headline: sampleCandidate.headline,
    summary: sampleCandidate.summary,
    category: sampleCandidate.category,
    image: sampleCandidate.image,
    video: sampleCandidate.video,
    publishedAt: new Date(sampleCandidate.publishedAt),
    updatedAt: new Date(sampleCandidate.updatedAt),
    breaking: sampleCandidate.breaking,
    materialUpdate: sampleCandidate.materialUpdate,
    clusterSourceCount: sampleCandidate.clusterSourceCount,
    clusterImportance: 50,
    sourceQualityTier: 'TRUSTED',
    sourceHealthScore: 80,
    citySlug: null,
    districtSlug: null,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 10,
    slug: sampleCandidate.slug,
    source: 'RECENT' as const,
    sortScore: Date.now(),
  }

  const normalCtx = await feedUserContextService.load(pilotUid)
  const penalizedCtx = {
    ...normalCtx,
    negativePreferences: [
      { targetType: 'category' as const, targetId: (sampleCandidate.category ?? 'gundem').toLowerCase(), modifier: 'DISLIKE' }
    ],
  }

  const normalScore = feedScoringService.scoreCandidate(candidateRow, normalCtx, 'personal')
  const penalizedScore = feedScoringService.scoreCandidate(candidateRow, penalizedCtx, 'personal')

  console.log('Negative Feedback Penalty Test:', {
    normalScore: normalScore.score.toFixed(4),
    penalizedScore: penalizedScore.score.toFixed(4),
    normalPenalties: normalScore.breakdown.penalties,
    penalizedPenalties: penalizedScore.breakdown.penalties,
    penaltyApplied: penalizedScore.score < normalScore.score,
  })

  // Card completeness audit
  const cardPayloadSize = JSON.stringify(personalFeed).length
  const avgCardPayloadSize = Math.round(cardPayloadSize / Math.max(1, personalFeed.items.length))
  console.log('Payload Stats:', {
    totalPayloadBytes: cardPayloadSize,
    avgCardPayloadBytes: avgCardPayloadSize,
    itemCount: personalFeed.items.length,
  })

  const output = {
    baseline: {
      healthRes,
      flagsInEnv,
      ufaRows,
      pubRows,
      claimCount,
      memberCount,
      pfaCount,
      ledgerCount,
      campaignCount,
      feedCounts,
    },
    audit30,
    qualityGates: {
      missingTitles,
      placeholderCount,
      testPublisherCount,
      missingSlugs,
      missingMedia,
      missingSummary,
    },
    clusterStats: {
      totalItems: audit30.length,
      uniqueArticles,
      uniqueClusters,
      clusterRepeatCount,
    },
    publisherDiversity: {
      uniquePublishers,
      topPublisherShare,
      publisherCounts,
      maxConsecutivePublisher,
    },
    categoryDiversity: {
      uniqueCategories,
      categoryCounts,
    },
    modeStats,
    suppressionTest: {
      testSeenIds,
      suppressedFoundInDirectCount: suppressedFoundInDirect.length,
    },
    negativeFeedbackTest: {
      normalScore: normalScore.score,
      penalizedScore: penalizedScore.score,
      penaltyApplied: penalizedScore.score < normalScore.score,
    },
    payload: {
      cardPayloadSize,
      avgCardPayloadSize,
    },
  }

  writeFileSync(
    resolve(process.cwd(), 'scripts/_phase_p15_report.json'),
    JSON.stringify(output, null, 2),
    'utf8'
  )
  console.log('Report saved to scripts/_phase_p15_report.json')
}

runAudit().catch((err) => {
  console.error('Audit failed:', err)
  process.exit(1)
})
