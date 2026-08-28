import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

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
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)

  const pilotUid = 'ap3scBglLIVwflfZN4qL8PKrM1A3'
  console.log('=== PHASE P17 REAL PILOT USAGE & FEED VALIDATION AUDIT ===\n')

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY 1
  `
  const tableSet = new Set(tables.map((t) => t.table_name))

  // 1. Inventory & Production DB Baseline
  const counts = {
    news_sources: tableSet.has('news_sources') ? (await sql`SELECT count(*)::int as c FROM news_sources`)[0].c : 0,
    raw_articles: tableSet.has('raw_articles') ? (await sql`SELECT count(*)::int as c FROM raw_articles`)[0].c : 0,
    news_clusters: tableSet.has('news_clusters') ? (await sql`SELECT count(*)::int as c FROM news_clusters`)[0].c : 0,
    news_total: tableSet.has('news') ? (await sql`SELECT count(*)::int as c FROM news`)[0].c : 0,
    news_published: tableSet.has('news') ? (await sql`SELECT count(*)::int as c FROM news WHERE status = 'published'`)[0].c : 0,
    news_archived: tableSet.has('news') ? (await sql`SELECT count(*)::int as c FROM news WHERE status = 'archived'`)[0].c : 0,
  }
  console.log('1. DB Inventory Baseline:', JSON.stringify(counts, null, 2))

  // 2. Pilot User Record & Feature Access Overrides
  const pilotUser = await sql`
    SELECT u.firebase_uid, u.email, u.display_name, u.role
    FROM users u
    WHERE u.firebase_uid = ${pilotUid}
  `
  console.log('2. Pilot User Record:', pilotUser[0] || 'NOT FOUND')

  const pilotFeatureAccess = await sql`
    SELECT feature_key, enabled, reason, updated_at
    FROM user_feature_access
    WHERE user_id = ${pilotUid}
    ORDER BY feature_key
  `
  console.log('2. Pilot Feature Access Overrides:', pilotFeatureAccess)

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
    user_interest_scores_pilot: (await sql`SELECT count(*)::int as c FROM user_interest_scores WHERE user_id = ${pilotUid}`)[0].c,
    user_publisher_affinity_pilot: (await sql`SELECT count(*)::int as c FROM user_publisher_affinity WHERE user_id = ${pilotUid}`)[0].c,
  }
  console.log('3. Pilot Telemetry & Activity Counts:', JSON.stringify(telemetryData, null, 2))

  const recentImpressions = await sql`
    SELECT article_id, feed_type, first_seen_at, last_seen_at, impression_count
    FROM user_content_impressions
    WHERE user_id = ${pilotUid}
    ORDER BY last_seen_at DESC
    LIMIT 10
  `
  console.log('3. Recent Pilot Impressions:', recentImpressions)

  const recentEvents = await sql`
    SELECT event_type, target_type, target_id, metadata, created_at
    FROM social_events
    WHERE user_id = ${pilotUid}
    ORDER BY created_at DESC
    LIMIT 10
  `
  console.log('3. Recent Pilot Social Events:', recentEvents)

  // 4. Published Canonical News Audit
  const publishedArticles = await sql`
    SELECT 
      n.id, n.title, n.slug, n.summary, n.cover_image_url, n.thumbnail_url, n.video_url,
      n.category_id, n.published_at, n.status, n.source,
      c.id as cluster_id, c.source_count, c.importance_score
    FROM news n
    LEFT JOIN news_clusters c ON c.published_news_id = n.id
    WHERE n.status = 'published'
    ORDER BY n.published_at DESC
  `
  console.log(`\n4. Published Articles in DB: ${publishedArticles.length}`)

  // 5. Eligible Feed Candidates in DB
  const eligibleFeedCards = publishedArticles.filter((a) => {
    const hasTitle = Boolean(a.title && a.title.trim().length > 5)
    const hasSummary = Boolean(a.summary && a.summary.trim().length > 0)
    const hasMedia = Boolean(a.cover_image_url || a.thumbnail_url || a.video_url)
    const hasSlug = Boolean(a.slug && a.slug.trim().length > 0)
    const isPlaceholder = /lorem|test|dummy|sample/i.test(a.title)
    const isTestPub = /test|mock/i.test(a.source || '')
    return hasTitle && hasSummary && hasMedia && hasSlug && !isPlaceholder && !isTestPub
  })
  console.log(`5. Eligible Feed Cards: ${eligibleFeedCards.length} / ${publishedArticles.length}`)

  // 6. Editorial Supply Continuity
  const unpublishedClustersWithSources = (await sql`
    SELECT count(*)::int as c
    FROM news_clusters c
    WHERE c.source_count >= 1
      AND c.published_news_id IS NULL
  `)[0].c

  const unpublishedRawArticles = (await sql`
    SELECT count(*)::int as c
    FROM raw_articles r
    WHERE r.editorial_news_id IS NULL
  `)[0].c

  console.log('\n6. Editorial Supply Continuity:', {
    unpublishedClustersWithSources,
    unpublishedRawArticles,
  })

  // 7. Follows, Likes, Saves breakdown for Pilot
  const pilotFollows = await sql`
    SELECT upf.publisher_id, p.name as publisher_name, upf.created_at
    FROM user_publisher_follows upf
    LEFT JOIN publishers p ON upf.publisher_id = p.id
    WHERE upf.user_id = ${pilotUid}
  `
  console.log('7. Pilot Follows:', pilotFollows)

  const pilotLikes = await sql`
    SELECT al.article_id, n.title, al.created_at
    FROM article_likes al
    LEFT JOIN news n ON al.article_id = n.id
    WHERE al.user_id = ${pilotUid}
    LIMIT 5
  `
  console.log('7. Pilot Likes:', pilotLikes)

  const pilotSaves = await sql`
    SELECT sa.article_id, n.title, sa.created_at
    FROM saved_articles sa
    LEFT JOIN news n ON sa.article_id = n.id
    WHERE sa.user_id = ${pilotUid}
    LIMIT 5
  `
  console.log('7. Pilot Saves:', pilotSaves)

  const pilotPreferences = await sql`
    SELECT preference_type, target_type, target_id, modifier, created_at
    FROM user_feed_preferences
    WHERE user_id = ${pilotUid}
  `
  console.log('7. Pilot Feed Preferences (Negative Feedback):', pilotPreferences)

  // Write summary json
  const report = {
    timestamp: new Date().toISOString(),
    inventory: counts,
    pilotUser: pilotUser[0] || null,
    pilotFeatureAccess,
    userCohortContainment: { uniqueOverriddenUsers, totalFeatureAccessRows },
    telemetryData,
    recentImpressions,
    recentEvents,
    publishedArticlesCount: publishedArticles.length,
    eligibleFeedCardsCount: eligibleFeedCards.length,
    supplyContinuity: {
      unpublishedClustersWithSources,
      unpublishedRawArticles,
    },
    pilotFollows,
    pilotLikes,
    pilotSaves,
    pilotPreferences,
  }

  writeFileSync(resolve(process.cwd(), 'scripts/_phase_p17_report.json'), JSON.stringify(report, null, 2))
  console.log('\nDone. Report written to scripts/_phase_p17_report.json')
}

runAudit().catch(err => {
  console.error('Audit failed:', err)
  process.exit(1)
})
