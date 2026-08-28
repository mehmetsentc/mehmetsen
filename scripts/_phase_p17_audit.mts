/**
 * Phase P17 — Real Pilot Usage & Feed Validation Audit
 *
 * Usage: npx tsx scripts/_phase_p17_audit.mts
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
  'CRAWLER_AI_DISPATCH_ENABLED',
  'LEGACY_DIRECT_AI_ENABLED',
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
  console.log('=== PHASE P17 REAL PILOT USAGE & FEED VALIDATION AUDIT ===\n')

  // 1. Inventory & Production DB Baseline
  const counts = {
    news_sources: (await sql`SELECT count(*)::int as c FROM news_sources`)[0].c,
    raw_articles: (await sql`SELECT count(*)::int as c FROM raw_articles`)[0].c,
    news_clusters: (await sql`SELECT count(*)::int as c FROM news_clusters`)[0].c,
    news_total: (await sql`SELECT count(*)::int as c FROM news`)[0].c,
    news_published: (await sql`SELECT count(*)::int as c FROM news WHERE status = 'published'`)[0].c,
    news_archived: (await sql`SELECT count(*)::int as c FROM news WHERE status = 'archived'`)[0].c,
    commercial_ledger: (await sql`SELECT count(*)::int as c FROM commercial_ledger`)[0].c,
    advertiser_accounts: (await sql`SELECT count(*)::int as c FROM advertiser_accounts`)[0].c,
  }
  console.log('1. DB Inventory Baseline:', counts)

  // 2. Pilot User Status & Overrides
  const pilotUser = await sql`
    SELECT u.firebase_uid, u.email, u.name, u.role
    FROM users u
    WHERE u.firebase_uid = ${pilotUid}
  `
  console.log('2. Pilot User Record:', pilotUser[0] || 'NOT FOUND')

  const pilotFeatureAccess = await sql`
    SELECT feature_key, enabled, reason, updated_at
    FROM user_feature_access
    WHERE user_id = ${pilotUid}
  `
  console.log('2. Pilot Feature Access Overrides:', pilotFeatureAccess)

  // Non-pilot user check
  const totalFeatureAccessRows = (await sql`SELECT count(*)::int as c FROM user_feature_access`)[0].c
  const uniqueOverriddenUsers = (await sql`SELECT count(DISTINCT user_id)::int as c FROM user_feature_access`)[0].c
  console.log(`2. User cohort containment: ${uniqueOverriddenUsers} user(s) with overrides (total ${totalFeatureAccessRows} flags).`)

  // 3. User Telemetry & Pilot Engagement Inspection
  const telemetryData = {
    impressions_total: (await sql`SELECT count(*)::int as c FROM user_content_impressions`)[0].c,
    impressions_pilot: (await sql`SELECT count(*)::int as c FROM user_content_impressions WHERE user_id = ${pilotUid}`)[0].c,
    impressions_guest: (await sql`SELECT count(*)::int as c FROM user_content_impressions WHERE user_id IS NULL`)[0].c,
    social_events_total: (await sql`SELECT count(*)::int as c FROM social_events`)[0].c,
    social_events_pilot: (await sql`SELECT count(*)::int as c FROM social_events WHERE user_id = ${pilotUid}`)[0].c,
    user_feed_preferences: (await sql`SELECT count(*)::int as c FROM user_feed_preferences WHERE user_id = ${pilotUid}`)[0].c,
    article_likes_pilot: (await sql`SELECT count(*)::int as c FROM article_likes WHERE user_id = ${pilotUid}`)[0].c,
    saved_articles_pilot: (await sql`SELECT count(*)::int as c FROM saved_articles WHERE user_id = ${pilotUid}`)[0].c,
    user_publisher_follows_pilot: (await sql`SELECT count(*)::int as c FROM user_publisher_follows WHERE user_id = ${pilotUid}`)[0].c,
    article_comments_pilot: (await sql`SELECT count(*)::int as c FROM article_comments WHERE user_id = ${pilotUid}`)[0].c,
  }
  console.log('3. Real Pilot Telemetry & Activity:', telemetryData)

  const recentImpressions = await sql`
    SELECT article_id, feed_type, first_seen_at, last_seen_at, impression_count
    FROM user_content_impressions
    WHERE user_id = ${pilotUid}
    ORDER BY last_seen_at DESC
    LIMIT 5
  `
  console.log('3. Recent Pilot Impressions:', recentImpressions)

  const recentEvents = await sql`
    SELECT event_type, target_type, target_id, metadata, created_at
    FROM social_events
    WHERE user_id = ${pilotUid}
    ORDER BY created_at DESC
    LIMIT 5
  `
  console.log('3. Recent Pilot Social Events:', recentEvents)

  // 4. Feed Service & Feed Modes Execution
  const { feedService } = await import('../src/services/feed/FeedService')
  const { isSmartFeedEffectiveForUser } = await import('../src/lib/user/effectiveUserFlags')

  // Access gate checks
  const pilotAllowed = await isSmartFeedEffectiveForUser(pilotUid)
  const nonPilotAllowed = await isSmartFeedEffectiveForUser('some-random-user-uid-12345')
  const guestAllowed = await isSmartFeedEffectiveForUser(null)

  console.log('\n4. Access Gate Verification:', {
    pilotUserAllowed: pilotAllowed,
    nonPilotUserAllowed: nonPilotAllowed,
    guestAllowed: guestAllowed,
  })

  // Mode evaluations for pilot user
  const modes = ['personal', 'breaking', 'following', 'local'] as const
  const modeResults: Record<string, any> = {}

  for (const m of modes) {
    const t0 = performance.now()
    const res = await feedService.getFeed({
      userId: pilotUid,
      mode: m,
      limit: 30,
      refresh: true,
    }, { debug: true })
    const t1 = performance.now()

    modeResults[m] = {
      latencyMs: parseFloat((t1 - t0).toFixed(2)),
      itemCount: res.items.length,
      hasMore: res.hasMore,
      nextCursor: res.nextCursor,
      emptyReason: res.emptyReason,
      rankingVersion: res.rankingVersion,
    }
  }
  console.log('4. Mode Results for Pilot:', modeResults)

  // 5. Personal Feed Quality & Completeness
  const personalFeed = await feedService.getFeed({
    userId: pilotUid,
    mode: 'personal',
    limit: 30,
    refresh: true,
  }, { debug: true })

  const items = personalFeed.items
  const qualityAudit = items.map((item, idx) => {
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
    }
  })

  const missingTitles = qualityAudit.filter((a) => !a.hasHeadline).length
  const placeholderCount = qualityAudit.filter((a) => a.isPlaceholder).length
  const testPublisherCount = qualityAudit.filter((a) => a.isTestPublisher).length
  const missingSlugs = qualityAudit.filter((a) => !a.hasSlug).length
  const missingMedia = qualityAudit.filter((a) => !a.hasMedia).length
  const missingSummary = qualityAudit.filter((a) => !a.hasSummary).length

  console.log('\n5. Personal Feed Card Quality Gates:', {
    totalReturned: items.length,
    missingTitles,
    placeholderCount,
    testPublisherCount,
    missingSlugs,
    missingMedia,
    missingSummary,
    qualityPass: missingTitles === 0 && placeholderCount === 0 && testPublisherCount === 0 && missingSlugs === 0 && missingMedia === 0 && missingSummary === 0,
  })

  // Cluster Dedup
  const clustersNonNull = qualityAudit.map((a) => a.clusterId).filter(Boolean) as string[]
  const uniqueClusters = new Set(clustersNonNull).size
  const clusterRepeatCount = clustersNonNull.length - uniqueClusters

  // Publisher & Category Diversity
  const publisherCounts: Record<string, number> = {}
  for (const a of qualityAudit) {
    publisherCounts[a.publisher] = (publisherCounts[a.publisher] || 0) + 1
  }
  const categoryCounts: Record<string, number> = {}
  for (const a of qualityAudit) {
    categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1
  }

  console.log('5. Diversity Stats:', {
    uniquePublishers: Object.keys(publisherCounts).length,
    publisherCounts,
    uniqueCategories: Object.keys(categoryCounts).length,
    categoryCounts,
    clusterRepeatCount,
  })

  // 6. Pagination & Cursor Continuity Check
  const page1 = await feedService.getFeed({
    userId: pilotUid,
    mode: 'personal',
    limit: 10,
    refresh: true,
  })
  console.log(`\n6. Pagination Check - Page 1 returned ${page1.items.length} items, hasMore: ${page1.hasMore}, cursor: ${page1.nextCursor}`)

  let page2ItemsCount = 0
  let page2HasMore = false
  if (page1.nextCursor) {
    const page2 = await feedService.getFeed({
      userId: pilotUid,
      mode: 'personal',
      cursor: page1.nextCursor,
      limit: 10,
    })
    page2ItemsCount = page2.items.length
    page2HasMore = page2.hasMore
    console.log(`6. Pagination Check - Page 2 returned ${page2.items.length} items, hasMore: ${page2.hasMore}, cursor: ${page2.nextCursor}`)

    // Check overlap between page 1 and page 2
    const p1Ids = new Set(page1.items.map(i => i.articleId))
    const overlaps = page2.items.filter(i => p1Ids.has(i.articleId)).length
    console.log(`6. Pagination Overlap between Page 1 and Page 2: ${overlaps} items`)
  }

  // 7. Editorial Supply Continuity (un-published clusters waiting)
  const candidateClusters = await sql`
    SELECT count(*)::int as c
    FROM news_clusters c
    WHERE c.source_count >= 1
      AND NOT EXISTS (
        SELECT 1 FROM news n WHERE n.cluster_id = c.id AND n.status = 'published'
      )
  `
  const rawArticlesUnpublished = await sql`
    SELECT count(*)::int as c
    FROM raw_articles r
    WHERE NOT EXISTS (
      SELECT 1 FROM news n WHERE n.canonical_url = r.url AND n.status = 'published'
    )
  `
  console.log('\n7. Editorial Supply Continuity:', {
    unpublishedClustersWithSources: candidateClusters[0].c,
    unpublishedRawArticles: rawArticlesUnpublished[0].c,
  })

  // Save Report Output
  const reportData = {
    timestamp: new Date().toISOString(),
    dbCounts: counts,
    pilotUser: pilotUser[0] || null,
    pilotFeatureAccess,
    userCohortContainment: { uniqueOverriddenUsers, totalFeatureAccessRows },
    telemetryData,
    accessGate: { pilotAllowed, nonPilotAllowed, guestAllowed },
    modeResults,
    qualityAuditSummary: {
      totalItems: items.length,
      missingTitles,
      placeholderCount,
      testPublisherCount,
      missingSlugs,
      missingMedia,
      missingSummary,
      clusterRepeatCount,
      uniquePublishers: Object.keys(publisherCounts).length,
      uniqueCategories: Object.keys(categoryCounts).length,
    },
    pagination: {
      page1Count: page1.items.length,
      page2Count: page2ItemsCount,
      page2HasMore,
    },
    supplyContinuity: {
      unpublishedClustersWithSources: candidateClusters[0].c,
      unpublishedRawArticles: rawArticlesUnpublished[0].c,
    },
  }

  writeFileSync(resolve(process.cwd(), 'scripts/_phase_p17_report.json'), JSON.stringify(reportData, null, 2))
  console.log('\nAudit completed. Output written to scripts/_phase_p17_report.json')
}

runAudit().catch((err) => {
  console.error('Audit failed:', err)
  process.exit(1)
})
