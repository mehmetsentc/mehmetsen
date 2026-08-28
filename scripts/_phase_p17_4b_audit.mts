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

const CANONICAL_PILOT_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'
const HISTORICAL_PILOT_UID = 'ap3scBglLIVwflfZN4qL8PKrM1A3'
const RANDOM_REGISTERED_UID = '2xBSzTUIcJW1VJcppsmRfT3aBC63'

const PILOT_FEATURES = [
  'USER_PROFILES',
  'SOCIAL_GRAPH',
  'SMART_FEED',
  'SMART_FEED_RANKING_V1',
  'COLD_START_V2',
  'SMART_FEED_VIDEO',
  'SMART_FEED_TELEMETRY',
] as const

const GLOBAL_FLAGS = [
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

// Ensure environment evaluates with global flags strictly OFF
for (const flag of GLOBAL_FLAGS) {
  process.env[flag] = 'false'
}

async function runAudit() {
  const { neon } = await import('@neondatabase/serverless')
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL missing')
    process.exit(1)
  }
  const sql = neon(url)

  console.log('=== P17.4B POST-CLEANUP & ISOLATION AUDIT ===')

  // 1. user_feature_access verification
  const activeUserCount = (await sql`SELECT count(DISTINCT user_id)::int as c FROM user_feature_access WHERE enabled = true`)[0].c
  const activeRowCount = (await sql`SELECT count(*)::int as c FROM user_feature_access WHERE enabled = true`)[0].c
  const totalRowCount = (await sql`SELECT count(*)::int as c FROM user_feature_access`)[0].c

  const activeGrants = await sql`
    SELECT user_id, feature_key, enabled, reason, updated_at
    FROM user_feature_access
    WHERE enabled = true
    ORDER BY feature_key
  `

  const historicalGrants = await sql`
    SELECT count(*)::int as c FROM user_feature_access WHERE user_id = ${HISTORICAL_PILOT_UID} AND enabled = true
  `

  console.log('1. user_feature_access invariants:', {
    activeUserCount,
    activeRowCount,
    totalRowCount,
    activeGrants,
    historicalPilotActiveGrants: historicalGrants[0].c,
  })

  // 2. Dynamic Feature Access Resolution via Service
  const {
    isSmartFeedEffectiveForUser,
    isSmartFeedRankingEffectiveForUser,
    isSocialGraphEffectiveForUser,
    isUserProfilesEffectiveForUser,
    isColdStartEffectiveForUser,
    isSmartFeedVideoEffectiveForUser,
    isSmartFeedTelemetryEffectiveForUser,
  } = await import('../src/lib/user/effectiveUserFlags')

  const canonicalResolutions = {
    SMART_FEED: await isSmartFeedEffectiveForUser(CANONICAL_PILOT_UID),
    SMART_FEED_RANKING_V1: await isSmartFeedRankingEffectiveForUser(CANONICAL_PILOT_UID),
    SOCIAL_GRAPH: await isSocialGraphEffectiveForUser(CANONICAL_PILOT_UID),
    USER_PROFILES: await isUserProfilesEffectiveForUser(CANONICAL_PILOT_UID),
    COLD_START_V2: await isColdStartEffectiveForUser(CANONICAL_PILOT_UID),
    SMART_FEED_VIDEO: await isSmartFeedVideoEffectiveForUser(CANONICAL_PILOT_UID),
    SMART_FEED_TELEMETRY: await isSmartFeedTelemetryEffectiveForUser(CANONICAL_PILOT_UID),
  }

  const historicalResolutions = {
    SMART_FEED: await isSmartFeedEffectiveForUser(HISTORICAL_PILOT_UID),
    SOCIAL_GRAPH: await isSocialGraphEffectiveForUser(HISTORICAL_PILOT_UID),
    USER_PROFILES: await isUserProfilesEffectiveForUser(HISTORICAL_PILOT_UID),
  }

  const randomRegisteredResolutions = {
    SMART_FEED: await isSmartFeedEffectiveForUser(RANDOM_REGISTERED_UID),
    SOCIAL_GRAPH: await isSocialGraphEffectiveForUser(RANDOM_REGISTERED_UID),
  }

  const anonymousResolutions = {
    SMART_FEED: await isSmartFeedEffectiveForUser(null),
    SOCIAL_GRAPH: await isSocialGraphEffectiveForUser(null),
  }

  console.log('2. Effective Feature Access Resolution:', {
    canonicalPilot: canonicalResolutions,
    historicalPilot: historicalResolutions,
    randomRegistered: randomRegisteredResolutions,
    anonymous: anonymousResolutions,
  })

  // 3. Feed Service verification for Canonical Pilot
  const { feedService } = await import('../src/services/feed/FeedService')
  const feedResult = await feedService.getFeed({
    userId: CANONICAL_PILOT_UID,
    mode: 'personal',
    limit: 15,
    refresh: true,
  }, { debug: true })

  console.log('3. FeedService response for Canonical Pilot:', {
    itemCount: feedResult.items.length,
    hasMore: feedResult.hasMore,
    rankingVersion: feedResult.rankingVersion,
    firstItemHeadline: feedResult.items[0]?.headline,
  })

  // 4. Platform Isolation & Unclaimed Publishers
  const targetPublishers = await sql`
    SELECT name, slug, status, verification_status
    FROM publishers
    WHERE slug IN ('bbc-turkce', 'trt-haber', 'the-guardian', 'le-monde', 'deutsche-welle-turkce', 'internal-test')
       OR name ILIKE ANY(ARRAY['%BBC%', '%TRT%', '%Guardian%', '%Monde%', '%Welle%'])
  `
  console.log('4. Major Publisher Isolation Status:', targetPublishers)

  // 5. Commercial Ledger & Marketplace Deliberate Zeros
  const ledgerCount = (await sql`SELECT count(*)::int as c FROM commercial_ledger_entries`)[0].c
  const advertiserCount = (await sql`SELECT count(*)::int as c FROM advertisers`)[0].c
  const campaignsCount = (await sql`SELECT count(*)::int as c FROM advertiser_campaigns`)[0].c

  console.log('5. Platform Economics Baseline:', {
    ledgerCount,
    advertiserCount,
    campaignsCount,
  })

  const auditReport = {
    timestamp: new Date().toISOString(),
    invariants: {
      activeUserCount,
      activeRowCount,
      totalRowCount,
      canonicalUid: CANONICAL_PILOT_UID,
      canonicalActiveGrants: activeGrants.length,
      historicalPilotActiveGrants: historicalGrants[0].c,
    },
    effectiveAccess: {
      canonicalPilot: canonicalResolutions,
      historicalPilot: historicalResolutions,
      randomRegistered: randomRegisteredResolutions,
      anonymous: anonymousResolutions,
    },
    feedOutput: {
      itemCount: feedResult.items.length,
      hasMore: feedResult.hasMore,
      rankingVersion: feedResult.rankingVersion,
    },
    publisherIsolation: targetPublishers,
    economics: {
      ledgerCount,
      advertiserCount,
      campaignsCount,
    },
  }

  writeFileSync(
    resolve(process.cwd(), 'scripts/_phase_p17_4b_audit_report.json'),
    JSON.stringify(auditReport, null, 2)
  )
  console.log('\nAudit complete! Report saved to scripts/_phase_p17_4b_audit_report.json')
}

runAudit().catch(err => {
  console.error('Audit failed:', err)
  process.exit(1)
})
