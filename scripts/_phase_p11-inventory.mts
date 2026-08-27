/**
 * Phase P11 pre-flight inventory — counts + migration presence (no secrets).
 * Usage: npx tsx scripts/_phase_p11-inventory.mts
 */
import { readFileSync, existsSync } from 'node:fs'
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

async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.log(JSON.stringify({ ok: false, error: 'NO_DATABASE_URL' }))
    process.exit(1)
  }

  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)

  const expected = [
    '0020_phase_p1_publisher_platform',
    '0021_phase_p1_1_publisher_platform',
    '0022_phase_p2_publisher_layouts',
    '0023_phase_p3_social_graph',
    '0024_phase_p4_smart_feed',
    '0025_phase_p5_smart_feed_ranking',
    '0026_phase_p6_seo_event_slug',
    '0027_phase_p7_publisher_content_studio',
    '0028_phase_p7a_publication_bridge',
    '0029_phase_p8_ad_inventory',
    '0030_phase_p7b_content_studio_ux',
    '0031_phase_p9_advertiser_marketplace',
    '0032_phase_p10a_commercial_ledger',
    '0033_phase_p10_self_managed_ads',
    '0034_phase_p11_publisher_rollout',
  ]

  const tables = await sql`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND (
        table_name LIKE 'publisher%'
        OR table_name IN (
          'payment_intents',
          'payment_transactions',
          'commercial_ledger_entries',
          'user_content_impressions',
          'user_profiles',
          'news_sources'
        )
      )
    ORDER BY 1`

  const tableSet = new Set(tables.map((t: { table_name: string }) => t.table_name))

  const counts = await sql`
    SELECT 'publishers' AS k, count(*)::int AS c FROM publishers
    UNION ALL SELECT 'verified', count(*)::int FROM publishers WHERE verification_status = 'VERIFIED'
    UNION ALL SELECT 'unclaimed', count(*)::int FROM publishers WHERE status = 'UNCLAIMED'
    UNION ALL SELECT 'pending_claims', count(*)::int FROM publisher_claim_requests WHERE status = 'PENDING'
    UNION ALL SELECT 'publisher_sources', count(*)::int FROM publisher_sources
    UNION ALL SELECT 'publisher_content_items', count(*)::int FROM publisher_content_items
    UNION ALL SELECT 'publisher_content_published', count(*)::int FROM publisher_content_items WHERE status = 'PUBLISHED'
    UNION ALL SELECT 'publisher_content_drafts', count(*)::int FROM publisher_content_items WHERE status = 'DRAFT'
    UNION ALL SELECT 'ad_inventory', count(*)::int FROM publisher_ad_inventory
    UNION ALL SELECT 'managed_ads', count(*)::int FROM publisher_managed_ads
    UNION ALL SELECT 'managed_ads_active', count(*)::int FROM publisher_managed_ads WHERE status = 'ACTIVE'
    UNION ALL SELECT 'ad_impressions', count(*)::int FROM publisher_ad_impressions
    UNION ALL SELECT 'ad_clicks', count(*)::int FROM publisher_ad_clicks
    UNION ALL SELECT 'news_sources', count(*)::int FROM news_sources
    UNION ALL SELECT 'payment_intents', count(*)::int FROM payment_intents
    UNION ALL SELECT 'payment_transactions', count(*)::int FROM payment_transactions
    UNION ALL SELECT 'commercial_ledger_entries', count(*)::int FROM commercial_ledger_entries
    UNION ALL SELECT 'publisher_earnings', count(*)::int FROM publisher_earnings
  `

  const countMap: Record<string, number> = {}
  for (const row of counts as Array<{ k: string; c: number }>) {
    countMap[row.k] = row.c
  }

  const featureAccessExists = tableSet.has('publisher_feature_access')
  if (featureAccessExists) {
    const fa = await sql`SELECT count(*)::int AS c FROM publisher_feature_access WHERE enabled = true`
    countMap.feature_access_enabled = (fa[0] as { c: number }).c
  }

  const flagKeys = [
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
    'ADVERTISER_PLATFORM_ENABLED',
    'AD_MARKETPLACE_ENABLED',
    'COMMERCIAL_LEDGER_ENABLED',
    'PAYMENT_INTENT_ENABLED',
    'PUBLISHER_EARNINGS_ENABLED',
    'SOCIAL_GRAPH_ENABLED',
    'USER_PROFILES_ENABLED',
    'SMART_FEED_ENABLED',
    'SMART_FEED_RANKING_V1_ENABLED',
    'COLD_START_V2_ENABLED',
    'APPLE_AUTH_ENABLED',
  ]

  const flags: Record<string, string> = {}
  for (const k of flagKeys) {
    flags[k] = process.env[k]?.trim() || '(unset)'
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        headHint: process.env.VERCEL_GIT_COMMIT_SHA || process.env.GIT_SHA || 'local',
        nodeEnv: process.env.NODE_ENV,
        vercelEnv: process.env.VERCEL_ENV || null,
        tablesPresent: [...tableSet],
        featureAccessTable: featureAccessExists,
        expectedMigrations: expected,
        counts: countMap,
        productionFlagsLocalEnv: flags,
        note: 'Production health SHA must be checked via GET /api/health on the live host.',
      },
      null,
      2
    )
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
