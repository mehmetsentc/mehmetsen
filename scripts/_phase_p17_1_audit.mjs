/**
 * Phase P17.1 — Comprehensive Read-Only Audit of Production Database
 * Strictly READ-ONLY queries.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { neon } from '@neondatabase/serverless'

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local')
  try {
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
  } catch (e) {}
}

loadEnvLocal()

async function run() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  const pilotUid = 'ap3scBglLIVwflfZN4qL8PKrM1A3'
  console.log('Querying DB read-only for Phase P17.1 Audit...')

  // 1. Inventory & Baseline Counts
  const counts = {
    news_total: (await sql`SELECT count(*)::int as c FROM news`)[0].c,
    news_published: (await sql`SELECT count(*)::int as c FROM news WHERE status = 'published'`)[0].c,
    news_archived: (await sql`SELECT count(*)::int as c FROM news WHERE status = 'archived'`)[0].c,
    news_draft: (await sql`SELECT count(*)::int as c FROM news WHERE status = 'draft'`)[0].c,
    news_clusters: (await sql`SELECT count(*)::int as c FROM news_clusters`)[0].c,
    raw_articles: (await sql`SELECT count(*)::int as c FROM raw_articles`)[0].c,
    news_sources: (await sql`SELECT count(*)::int as c FROM news_sources`)[0].c,
    publishers: (await sql`SELECT count(*)::int as c FROM publishers`)[0].c,
    commercial_ledger_entries: (await sql`SELECT count(*)::int as c FROM commercial_ledger_entries`)[0].c,
    advertisers: (await sql`SELECT count(*)::int as c FROM advertisers`)[0].c,
    payment_intents: (await sql`SELECT count(*)::int as c FROM payment_intents`)[0].c,
    payment_transactions: (await sql`SELECT count(*)::int as c FROM payment_transactions`)[0].c,
    publisher_earnings: (await sql`SELECT count(*)::int as c FROM publisher_earnings`)[0].c,
    crawler_ai_jobs: (await sql`SELECT count(*)::int as c FROM crawler_ai_jobs`)[0].c,
    crawler_ai_cost_ledger: (await sql`SELECT count(*)::int as c FROM crawler_ai_cost_ledger`)[0].c,
    crawler_ai_dispatch_shadow: (await sql`SELECT count(*)::int as c FROM crawler_ai_dispatch_shadow`)[0].c,
    user_content_impressions_total: (await sql`SELECT count(*)::int as c FROM user_content_impressions`)[0].c,
    social_events_total: (await sql`SELECT count(*)::int as c FROM social_events`)[0].c,
    article_likes_total: (await sql`SELECT count(*)::int as c FROM article_likes`)[0].c,
    saved_articles_total: (await sql`SELECT count(*)::int as c FROM saved_articles`)[0].c,
    article_comments_total: (await sql`SELECT count(*)::int as c FROM article_comments`)[0].c,
    user_publisher_follows_total: (await sql`SELECT count(*)::int as c FROM user_publisher_follows`)[0].c,
    user_feature_access_total: (await sql`SELECT count(*)::int as c FROM user_feature_access`)[0].c,
    user_interest_scores_total: (await sql`SELECT count(*)::int as c FROM user_interest_scores`)[0].c,
    user_publisher_affinity_total: (await sql`SELECT count(*)::int as c FROM user_publisher_affinity`)[0].c,
    user_feed_preferences_total: (await sql`SELECT count(*)::int as c FROM user_feed_preferences`)[0].c,
  }

  // Pilot User Record
  const pilotUser = await sql`
    SELECT firebase_uid, email, username, display_name, role, home_city_slug, created_at, updated_at
    FROM users
    WHERE firebase_uid = ${pilotUid}
  `

  // Feature Access for Pilot
  const pilotFeatureAccess = await sql`
    SELECT user_id, feature_key, enabled, reason, updated_at, created_at
    FROM user_feature_access
    WHERE user_id = ${pilotUid}
  `

  // All Feature Access Overrides
  const allFeatureAccess = await sql`
    SELECT user_id, feature_key, enabled, reason, updated_at
    FROM user_feature_access
  `

  // Pilot User Impressions
  const pilotImpressions = await sql`
    SELECT i.id, i.user_id, i.session_id, i.article_id, i.cluster_id, i.publisher_id, i.feed_type,
           i.first_seen_at, i.last_seen_at, i.impression_count,
           n.title, n.slug, n.category_id, n.published_at,
           p.name as publisher_name, p.slug as publisher_slug
    FROM user_content_impressions i
    LEFT JOIN news n ON n.id = i.article_id
    LEFT JOIN publishers p ON p.id = i.publisher_id
    WHERE i.user_id = ${pilotUid}
    ORDER BY i.last_seen_at DESC
  `

  // Pilot Social Events (Human UI events vs Smoke tests)
  const pilotSocialEvents = await sql`
    SELECT id, event_type, target_type, target_id, metadata, created_at
    FROM social_events
    WHERE user_id = ${pilotUid}
    ORDER BY created_at ASC
  `

  // Pilot Likes
  const pilotLikes = await sql`
    SELECT l.article_id, l.created_at, n.title, n.slug
    FROM article_likes l
    LEFT JOIN news n ON n.id = l.article_id
    WHERE l.user_id = ${pilotUid}
    ORDER BY l.created_at DESC
  `

  // Pilot Saves
  const pilotSaves = await sql`
    SELECT s.article_id, s.created_at, n.title, n.slug
    FROM saved_articles s
    LEFT JOIN news n ON n.id = s.article_id
    WHERE s.user_id = ${pilotUid}
    ORDER BY s.created_at DESC
  `

  // Pilot Follows
  const pilotFollows = await sql`
    SELECT f.publisher_id, f.created_at, p.name as publisher_name, p.slug as publisher_slug
    FROM user_publisher_follows f
    LEFT JOIN publishers p ON p.id = f.publisher_id
    WHERE f.user_id = ${pilotUid}
    ORDER BY f.created_at DESC
  `

  // Pilot Feed Preferences
  const pilotFeedPrefs = await sql`
    SELECT id, user_id, preference_type, target_type, target_id, modifier, created_at
    FROM user_feed_preferences
    WHERE user_id = ${pilotUid}
    ORDER BY created_at DESC
  `

  // Pilot Interest Scores
  const pilotInterestScores = await sql`
    SELECT interest_key, score, source, updated_at
    FROM user_interest_scores
    WHERE user_id = ${pilotUid}
    ORDER BY score DESC
  `

  // Pilot Publisher Affinity
  const pilotPublisherAffinity = await sql`
    SELECT a.publisher_id, a.score, a.updated_at, p.name as publisher_name, p.slug as publisher_slug
    FROM user_publisher_affinity a
    LEFT JOIN publishers p ON p.id = a.publisher_id
    WHERE a.user_id = ${pilotUid}
    ORDER BY a.score DESC
  `

  // Major Publishers Claim Status Check
  const majorPublishers = await sql`
    SELECT id, name, slug, display_name, verification_status, claimed_at, verified_at
    FROM publishers
    WHERE name ILIKE ANY(ARRAY['%guardian%', '%trt%', '%le monde%', '%dw%', '%bbc%'])
       OR slug ILIKE ANY(ARRAY['%guardian%', '%trt%', '%lemonde%', '%le-monde%', '%dw%', '%bbc%'])
  `

  // Check publisher claim requests
  const claimRequests = await sql`SELECT count(*)::int as c FROM publisher_claim_requests`

  // Published News Quality Audit
  const [newsQuality] = await sql`
    SELECT
      count(*)::int as total_published,
      sum(CASE WHEN title IS NULL OR length(trim(title)) < 5 THEN 1 ELSE 0 END)::int as missing_title,
      sum(CASE WHEN summary IS NULL OR length(trim(summary)) = 0 THEN 1 ELSE 0 END)::int as missing_summary,
      sum(CASE WHEN thumbnail_url IS NULL AND cover_image_url IS NULL THEN 1 ELSE 0 END)::int as missing_media,
      sum(CASE WHEN slug IS NULL OR length(trim(slug)) = 0 THEN 1 ELSE 0 END)::int as missing_slug,
      sum(CASE WHEN title ILIKE '%lorem%' OR title ILIKE '%dummy%' OR title ILIKE '%sample%' THEN 1 ELSE 0 END)::int as placeholder_titles
    FROM news
    WHERE status = 'published'
  `

  // Published News Publisher Distribution
  const publisherDistribution = await sql`
    SELECT coalesce(p.name, n.source, 'Bilinmeyen') as publisher_name, count(*)::int as article_count
    FROM news n
    LEFT JOIN raw_articles r ON r.canonical_url = n.source_url
    LEFT JOIN news_sources ns ON ns.id = r.source_id
    LEFT JOIN publisher_sources ps ON ps.source_id = ns.id
    LEFT JOIN publishers p ON p.id = ps.publisher_id
    WHERE n.status = 'published'
    GROUP BY coalesce(p.name, n.source, 'Bilinmeyen')
    ORDER BY article_count DESC
  `

  // Published News Category Distribution
  const categoryDistribution = await sql`
    SELECT coalesce(c.slug, n.category_id, 'genel') as category, count(*)::int as article_count
    FROM news n
    LEFT JOIN categories c ON c.id = n.category_id
    WHERE n.status = 'published'
    GROUP BY coalesce(c.slug, n.category_id, 'genel')
    ORDER BY article_count DESC
  `

  // Unpublished Reserve Clusters
  const [reserveClusters] = await sql`
    SELECT count(*)::int as count
    FROM news_clusters c
    WHERE c.source_count >= 1
      AND NOT EXISTS (
        SELECT 1 FROM news n
        JOIN raw_articles r ON r.canonical_url = n.source_url
        WHERE r.cluster_id = c.id AND n.status = 'published'
      )
  `

  // Check Git commit info
  let gitCommit = 'local-head'
  try {
    const gitHead = readFileSync(resolve(process.cwd(), '.git/HEAD'), 'utf8').trim()
    if (gitHead.startsWith('ref:')) {
      const refPath = resolve(process.cwd(), '.git', gitHead.slice(5).trim())
      if (existsSync(refPath)) {
        gitCommit = readFileSync(refPath, 'utf8').trim()
      } else {
        gitCommit = gitHead
      }
    } else {
      gitCommit = gitHead
    }
  } catch (e) {}

  const payload = {
    gitCommit,
    timestamp: new Date().toISOString(),
    counts,
    pilotUser: pilotUser[0] || null,
    pilotFeatureAccess,
    allFeatureAccess,
    pilotImpressionsCount: pilotImpressions.length,
    pilotImpressions,
    pilotSocialEventsCount: pilotSocialEvents.length,
    pilotSocialEvents,
    pilotLikes,
    pilotSaves,
    pilotFollows,
    pilotFeedPrefs,
    pilotInterestScores,
    pilotPublisherAffinity,
    majorPublishers,
    claimRequestsCount: claimRequests[0].c,
    newsQuality,
    publisherDistribution,
    categoryDistribution,
    reserveClustersCount: reserveClusters.count,
  }

  writeFileSync(resolve(process.cwd(), 'scripts/_phase_p17_1_audit_out.json'), JSON.stringify(payload, null, 2))
  console.log('Saved audit data to scripts/_phase_p17_1_audit_out.json')
}

run().catch(e => {
  console.error('Run failed:', e)
  process.exit(1)
})
