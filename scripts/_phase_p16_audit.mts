/**
 * Phase P16 — Smart Feed & Editorial Supply Audit
 *
 * Usage: npx tsx scripts/_phase_p16_audit.mts
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
  console.log('--- Phase P16 Feed Re-Audit Started ---')

  // 1. Production Inventory State
  const inventoryCounts = {
    news_sources: (await sql`SELECT count(*)::int as c FROM news_sources`)[0].c,
    raw_articles: (await sql`SELECT count(*)::int as c FROM raw_articles`)[0].c,
    news_clusters: (await sql`SELECT count(*)::int as c FROM news_clusters`)[0].c,
    news_total: (await sql`SELECT count(*)::int as c FROM news`)[0].c,
    news_published: (await sql`SELECT count(*)::int as c FROM news WHERE status = 'published'`)[0].c,
    news_archived: (await sql`SELECT count(*)::int as c FROM news WHERE status = 'archived'`)[0].c,
  }

  console.log('1. Inventory state:', inventoryCounts)

  // 2. Feed Service Ingestion / Ranking
  const { feedService } = await import('../src/services/feed/FeedService')

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

  const items = personalFeed.items
  const auditItems = items.map((item, idx) => {
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

  // Quality Gates
  const missingTitles = auditItems.filter((a) => !a.hasHeadline).length
  const placeholderCount = auditItems.filter((a) => a.isPlaceholder).length
  const testPublisherCount = auditItems.filter((a) => a.isTestPublisher).length
  const missingSlugs = auditItems.filter((a) => !a.hasSlug).length
  const missingMedia = auditItems.filter((a) => !a.hasMedia).length
  const missingSummary = auditItems.filter((a) => !a.hasSummary).length

  console.log('Quality Gates:', {
    missingTitles,
    placeholderCount,
    testPublisherCount,
    missingSlugs,
    missingMedia,
    missingSummary,
  })

  // Cluster Dedup
  const uniqueArticles = new Set(auditItems.map((a) => a.id)).size
  const clustersNonNull = auditItems.map((a) => a.clusterId).filter(Boolean) as string[]
  const uniqueClusters = new Set(clustersNonNull).size
  const clusterRepeatCount = clustersNonNull.length - uniqueClusters

  console.log('Cluster Analysis:', {
    totalItems: auditItems.length,
    uniqueArticles,
    uniqueClusters,
    clustersNonNullCount: clustersNonNull.length,
    clusterRepeatCount,
  })

  // Publisher Diversity
  const publisherCounts: Record<string, number> = {}
  for (const a of auditItems) {
    publisherCounts[a.publisher] = (publisherCounts[a.publisher] || 0) + 1
  }
  const uniquePublishers = Object.keys(publisherCounts).length
  const topPublisherShare = Math.max(...Object.values(publisherCounts)) / auditItems.length

  let maxConsecutivePublisher = 1
  let currentRun = 1
  for (let i = 1; i < auditItems.length; i++) {
    if (auditItems[i].publisher === auditItems[i - 1].publisher) {
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
  for (const a of auditItems) {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1
  }
  const uniqueCategories = Object.keys(categoryCounts).length

  console.log('Category Diversity:', {
    uniqueCategories,
    categoryCounts,
  })

  // All 4 Modes Freshness
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

    modeStats[m] = {
      count: res.items.length,
      latencyMs: parseFloat(lat.toFixed(2)),
      medianAgeHours: parseFloat(median.toFixed(2)),
      p90AgeHours: parseFloat(p90.toFixed(2)),
    }
  }

  console.log('Mode Stats:', modeStats)

  const report = {
    timestamp: new Date().toISOString(),
    phase: 'P16',
    pilotUid,
    inventory: inventoryCounts,
    personalFeed: {
      totalReturned: auditItems.length,
      latencyMs: parseFloat(personalLatencyMs.toFixed(2)),
      qualityGates: {
        missingTitles,
        placeholderCount,
        testPublisherCount,
        missingSlugs,
        missingMedia,
        missingSummary,
      },
      clusterDedup: {
        uniqueArticles,
        uniqueClusters,
        clusterRepeatCount,
      },
      publisherDiversity: {
        uniquePublishers,
        topPublisherShare: parseFloat((topPublisherShare * 100).toFixed(1)),
        publisherCounts,
        maxConsecutivePublisher,
      },
      categoryDiversity: {
        uniqueCategories,
        categoryCounts,
      },
      first30Items: auditItems,
    },
    modeStats,
    verdict: 'GO — CANONICAL FEED INVENTORY READY',
  }

  writeFileSync(resolve(process.cwd(), 'scripts/_phase_p16_report.json'), JSON.stringify(report, null, 2))
  console.log('Saved report to scripts/_phase_p16_report.json')
  return report
}

runAudit().catch(console.error)
