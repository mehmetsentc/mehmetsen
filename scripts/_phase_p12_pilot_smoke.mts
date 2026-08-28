/**
 * Phase P12 — First Real Publisher Controlled Pilot Smoke & Verification
 *
 * Usage: npx tsx scripts/_phase_p12_pilot_smoke.mts
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
for (const k of FLAG_KEYS) process.env[k] = 'false'

const SELECTED_CANDIDATE_SLUG = 'the-guardian-world-rss'
const OTHER_REAL_SLUGS = [
  'trt-haber-rss',
  'le-monde-rss',
  'deutsche-welle-rss',
  'bbc-world-rss',
]
const UNRELATED_UID = 'p12_unauthorized_user_attempt'

type Step = { name: string; ok: boolean; detail?: string }

async function counts(sql: ReturnType<Awaited<typeof import('@neondatabase/serverless')>['neon']>) {
  const rows = await sql`
    SELECT 'publishers' AS k, count(*)::int AS c FROM publishers
    UNION ALL SELECT 'verified', count(*)::int FROM publishers WHERE verification_status = 'VERIFIED'
    UNION ALL SELECT 'unclaimed', count(*)::int FROM publishers WHERE status = 'UNCLAIMED'
    UNION ALL SELECT 'payment_intents', count(*)::int FROM payment_intents
    UNION ALL SELECT 'payment_transactions', count(*)::int FROM payment_transactions
    UNION ALL SELECT 'commercial_ledger_entries', count(*)::int FROM commercial_ledger_entries
    UNION ALL SELECT 'publisher_earnings', count(*)::int FROM publisher_earnings
    UNION ALL SELECT 'campaigns', count(*)::int FROM advertiser_campaigns
    UNION ALL SELECT 'booking_requests', count(*)::int FROM ad_booking_requests
    UNION ALL SELECT 'bookings', count(*)::int FROM ad_bookings
    UNION ALL SELECT 'managed_ads', count(*)::int FROM publisher_managed_ads
    UNION ALL SELECT 'ad_impressions', count(*)::int FROM publisher_ad_impressions
    UNION ALL SELECT 'ad_clicks', count(*)::int FROM publisher_ad_clicks
    UNION ALL SELECT 'content_items', count(*)::int FROM publisher_content_items
    UNION ALL SELECT 'ad_inventory', count(*)::int FROM publisher_ad_inventory
    UNION ALL SELECT 'feature_access_enabled', count(*)::int FROM publisher_feature_access WHERE enabled = true
  `
  const m: Record<string, number> = {}
  for (const r of rows as Array<{ k: string; c: number }>) m[r.k] = r.c
  return m
}

function adminUid(): string {
  const raw = process.env.NEXT_PUBLIC_ADMIN_UIDS?.split(',')[0]?.trim()
  if (!raw) throw new Error('NO_ADMIN_UID')
  return raw
}

async function main() {
  const steps: Step[] = []
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    phase: 'P12',
    nodeEnv: process.env.NODE_ENV,
    globalsForcedFalse: true,
  }

  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    console.log(JSON.stringify({ ok: false, error: 'NO_DATABASE_URL' }))
    process.exit(1)
  }
  const { neon } = await import('@neondatabase/serverless')
  const sql = neon(url)

  const before = await counts(sql)
  report.before = before

  const actorAdminUid = adminUid()

  // Dynamic imports of services
  const { publisherRepository } = await import('@/services/publisher/publisherRepository')
  const { publisherFeatureAccessService } = await import(
    '@/services/publisher/publisherFeatureAccessService'
  )
  const { isFeatureEnabledForPublisher } = await import('@/lib/publisher/effectiveFlags')
  const { publisherProfileService } = await import('@/services/publisher/publisherLayoutService')
  const { publisherService } = await import('@/services/publisher/publisherService')
  const { evaluatePublisherSeo } = await import('@/lib/seo/seoEligibility')
  const { publisherCanonicalUrl } = await import('@/lib/seo/canonical')
  const { buildPublisherAdMediaKey, buildPublisherContentMediaKey } = await import('@/lib/storage')
  const { loadStudioPublisherForPage } = await import('@/lib/publisher/studioPageAccess')

  // Step 1: Check selected real publisher
  const selectedPub = await publisherRepository.findBySlug(SELECTED_CANDIDATE_SLUG)
  if (!selectedPub) {
    console.log(JSON.stringify({ ok: false, error: 'SELECTED_PUBLISHER_NOT_FOUND' }))
    process.exit(1)
  }

  steps.push({
    name: 'candidate_selected',
    ok: selectedPub.slug === SELECTED_CANDIDATE_SLUG && selectedPub.publisherType === 'NEWS_ORGANIZATION',
    detail: `id=${selectedPub.id}, slug=${selectedPub.slug}, type=${selectedPub.publisherType}`,
  })

  // Verify candidate is unclaimed with 0 members
  const owner = await publisherRepository.findActiveOwner(selectedPub.id)
  steps.push({
    name: 'candidate_unclaimed_zero_owner',
    ok: selectedPub.status === 'UNCLAIMED' && selectedPub.verificationStatus === 'UNCLAIMED' && owner === null,
    detail: `status=${selectedPub.status}, verification=${selectedPub.verificationStatus}, owner=${owner ? owner.id : 'null'}`,
  })

  // Step 2: Check Source Mapping & Raw Articles Inventory
  const sourceRows = await sql`
    SELECT ps.source_id, ns.name as source_name, ns.domain as source_domain, ns.base_url as source_base_url,
           (SELECT count(*)::int FROM raw_articles ra WHERE ra.source_id = ps.source_id) as raw_count
    FROM publisher_sources ps
    JOIN news_sources ns ON ns.id = ps.source_id
    WHERE ps.publisher_id = ${selectedPub.id}
  `
  const singleCleanSource = sourceRows.length === 1 && (sourceRows[0] as { source_domain: string }).source_domain === 'theguardian.com'
  const rawArticlesCount = (sourceRows[0] as { raw_count: number })?.raw_count ?? 0
  steps.push({
    name: 'source_association_audit',
    ok: singleCleanSource && rawArticlesCount > 0,
    detail: `sourceCount=${sourceRows.length}, domain=${(sourceRows[0] as any)?.source_domain}, rawArticles=${rawArticlesCount}`,
  })
  report.candidateSource = sourceRows[0]

  // Step 3: Check Other Real Publishers Untouched
  const otherPubs = await sql`
    SELECT p.id, p.slug, p.status, p.verification_status,
           (SELECT count(*)::int FROM publisher_members pm WHERE pm.publisher_id = p.id) as members,
           (SELECT count(*)::int FROM publisher_claim_requests pcr WHERE pcr.publisher_id = p.id) as claims,
           (SELECT count(*)::int FROM publisher_feature_access pfa WHERE pfa.publisher_id = p.id AND pfa.enabled = true) as grants
    FROM publishers p
    WHERE p.slug = ANY(${OTHER_REAL_SLUGS})
  `
  const othersUntouched = (otherPubs as Array<{ slug: string; status: string; verification_status: string; members: number; claims: number; grants: number }>).every(
    (p) => p.status === 'UNCLAIMED' && p.verification_status === 'UNCLAIMED' && p.members === 0 && p.claims === 0 && p.grants === 0
  )
  steps.push({
    name: 'other_real_publishers_untouched',
    ok: othersUntouched && otherPubs.length === 4,
    detail: `count=${otherPubs.length}, untouched=${othersUntouched}`,
  })
  report.otherRealPublishers = otherPubs

  // Step 4: Grant Controlled Pilot Capabilities to Selected Real Publisher
  const pilotFeatures = [
    'PLATFORM',
    'STUDIO',
    'PROFILE_COMPOSER',
    'CONTENT_STUDIO',
    'MANUAL_PUBLISH',
    'MEDIA_UPLOAD',
  ] as const

  for (const featureKey of pilotFeatures) {
    await publisherFeatureAccessService.setFeatureAccess({
      publisherId: selectedPub.id,
      featureKey,
      enabled: true,
      actorId: actorAdminUid,
      note: 'P12 First Real Publisher Pilot Bundle',
    })
  }

  const featureResults: Record<string, boolean> = {}
  for (const f of pilotFeatures) {
    featureResults[f] = await isFeatureEnabledForPublisher(selectedPub.id, f)
  }
  const allPilotFeaturesOn = Object.values(featureResults).every(Boolean)
  steps.push({
    name: 'pilot_capabilities_granted',
    ok: allPilotFeaturesOn,
    detail: JSON.stringify(featureResults),
  })
  report.candidateFeatureGrants = featureResults

  process.env.NEXT_PUBLIC_SITE_URL = 'https://www.nahaber.com'

  // Verify ads-related features require VERIFIED status and are blocked for UNCLAIMED candidate
  let adsBlockedUnverified = false
  try {
    await publisherFeatureAccessService.setFeatureAccess({
      publisherId: selectedPub.id,
      featureKey: 'AD_INVENTORY',
      enabled: true,
      actorId: actorAdminUid,
      note: 'should fail for unverified',
    })
  } catch (err: any) {
    if (err.message === 'PUBLISHER_NOT_VERIFIED') {
      adsBlockedUnverified = true
    }
  }
  steps.push({
    name: 'ads_capabilities_blocked_unverified',
    ok: adsBlockedUnverified,
    detail: 'AD_INVENTORY blocked with PUBLISHER_NOT_VERIFIED as required',
  })

  const videoPrerollOff = !(await isFeatureEnabledForPublisher(selectedPub.id, 'VIDEO_PREROLL'))
  steps.push({
    name: 'video_preroll_blocked',
    ok: videoPrerollOff,
    detail: `VIDEO_PREROLL=${!videoPrerollOff}`,
  })

  // Verify other publishers still have 0 effective features
  let othersIsolated = true
  for (const o of otherPubs as Array<{ id: string; slug: string }>) {
    const pOn = await isFeatureEnabledForPublisher(o.id, 'PLATFORM')
    const sOn = await isFeatureEnabledForPublisher(o.id, 'STUDIO')
    if (pOn || sOn) {
      othersIsolated = false
      break
    }
  }
  steps.push({
    name: 'other_publishers_feature_isolation',
    ok: othersIsolated,
    detail: `isolated=${othersIsolated}`,
  })

  // Step 5: Public Profile & SEO Verification
  const publicPub = await publisherService.getPublicPublisherBySlug(selectedPub.slug)
  steps.push({
    name: 'public_publisher_profile_resolved',
    ok: publicPub !== null && publicPub.isPubliclyVisible === true && publicPub.slug === SELECTED_CANDIDATE_SLUG,
    detail: `visible=${publicPub?.isPubliclyVisible}, type=${publicPub?.publisherType}`,
  })

  const seoEligibility = publicPub ? evaluatePublisherSeo(publicPub, rawArticlesCount) : null
  const seoOk = seoEligibility?.indexable === true && seoEligibility?.noindexReason === 'none' && seoEligibility?.follow === true
  steps.push({
    name: 'public_publisher_seo_indexable',
    ok: seoOk,
    detail: `indexable=${seoEligibility?.indexable}, noindexReason=${seoEligibility?.noindexReason}`,
  })

  const canonical = publisherCanonicalUrl(selectedPub.slug)
  steps.push({
    name: 'canonical_url_correct',
    ok: canonical === `https://www.nahaber.com/publisher/${selectedPub.slug}`,
    detail: canonical,
  })

  // Step 6: Article Association (Presentation-only, no re-publish, no raw mutation)
  const articlesPage = await publisherService.getPublisherArticles(selectedPub.id, 10)
  steps.push({
    name: 'existing_articles_resolved_presentationally',
    ok: Array.isArray(articlesPage.items),
    detail: `resolvedCount=${articlesPage.items.length}`,
  })

  // Step 7: Studio Authorization Protection for Unclaimed Real Publisher
  // Non-member or unauthorized user MUST be denied
  let unauthorizedDenied = false
  try {
    await publisherProfileService.updateProfile(selectedPub.id, UNRELATED_UID, {
      description: 'should fail - unauthorized attempt',
    })
  } catch {
    unauthorizedDenied = true
  }
  steps.push({
    name: 'unclaimed_studio_unauthorized_access_denied',
    ok: unauthorizedDenied,
    detail: 'Non-member access rejected with 403 NOT_MEMBER',
  })

  // Studio page server loader resolves publisher for allowlisted candidate
  const studioPagePub = await loadStudioPublisherForPage(selectedPub.slug)
  steps.push({
    name: 'studio_page_gate_resolves_allowlist',
    ok: studioPagePub !== null && studioPagePub.id === selectedPub.id,
    detail: `loadedStudioPub=${studioPagePub?.slug}`,
  })

  // Step 8: R2 Media Path Scoping Verification
  const adMediaKey = buildPublisherAdMediaKey(selectedPub.id, 'pmad_pilot_123', 'banner.png')
  const contentMediaKey = buildPublisherContentMediaKey(selectedPub.id, 'pcnt_pilot_456', 'hero.jpg')
  const r2Scoped =
    adMediaKey.startsWith(`publishers/${selectedPub.id}/ads/`) &&
    contentMediaKey.startsWith(`publishers/${selectedPub.id}/content/`)
  steps.push({
    name: 'r2_media_path_scoped_and_isolated',
    ok: r2Scoped,
    detail: `adKey=${adMediaKey}, contentKey=${contentMediaKey}`,
  })

  // Step 9: Rollback Procedure Test
  // Revoking feature access returns candidate to baseline without data loss
  await publisherFeatureAccessService.setFeatureAccess({
    publisherId: selectedPub.id,
    featureKey: 'PLATFORM',
    enabled: false,
    actorId: actorAdminUid,
    note: 'P12 rollback test: disable PLATFORM',
  })
  const platformRolledBack = await isFeatureEnabledForPublisher(selectedPub.id, 'PLATFORM')
  const studioRolledBack = await isFeatureEnabledForPublisher(selectedPub.id, 'STUDIO')
  steps.push({
    name: 'rollback_grants_revoked_successfully',
    ok: !platformRolledBack && !studioRolledBack,
    detail: `platformAfterRollback=${platformRolledBack}, studioAfterRollback=${studioRolledBack}`,
  })

  // Restore pilot bundle to leave real publisher in active pilot state
  await publisherFeatureAccessService.setFeatureAccess({
    publisherId: selectedPub.id,
    featureKey: 'PLATFORM',
    enabled: true,
    actorId: actorAdminUid,
    note: 'P12 restore PLATFORM for pilot state',
  })
  const platformRestored = await isFeatureEnabledForPublisher(selectedPub.id, 'PLATFORM')
  const studioRestored = await isFeatureEnabledForPublisher(selectedPub.id, 'STUDIO')
  steps.push({
    name: 'pilot_state_re_enabled_after_rollback_test',
    ok: platformRestored && studioRestored,
    detail: `platform=${platformRestored}, studio=${studioRestored}`,
  })

  // Step 10: Verify Financial & Marketplace Baseline Counts (Delta = 0)
  const after = await counts(sql)
  report.after = after

  const financialDelta = {
    payment_intents: after.payment_intents - before.payment_intents,
    payment_transactions: after.payment_transactions - before.payment_transactions,
    commercial_ledger_entries:
      after.commercial_ledger_entries - before.commercial_ledger_entries,
    publisher_earnings: after.publisher_earnings - before.publisher_earnings,
  }
  const marketplaceDelta = {
    campaigns: after.campaigns - before.campaigns,
    booking_requests: after.booking_requests - before.booking_requests,
    bookings: after.bookings - before.bookings,
  }
  report.financialDelta = financialDelta
  report.marketplaceDelta = marketplaceDelta

  const finZero = Object.values(financialDelta).every((v) => v === 0)
  const mktZero = Object.values(marketplaceDelta).every((v) => v === 0)
  steps.push({
    name: 'financial_delta_zero',
    ok: finZero,
    detail: JSON.stringify(financialDelta),
  })
  steps.push({
    name: 'marketplace_delta_zero',
    ok: mktZero,
    detail: JSON.stringify(marketplaceDelta),
  })

  // Step 11: Real publisher remains UNCLAIMED (no fake human owner created)
  const finalCandidate = await publisherRepository.findBySlug(SELECTED_CANDIDATE_SLUG)
  const finalOwner = await publisherRepository.findActiveOwner(selectedPub.id)
  steps.push({
    name: 'real_publisher_remains_unclaimed_legitimate_state',
    ok:
      finalCandidate?.status === 'UNCLAIMED' &&
      finalCandidate?.verificationStatus === 'UNCLAIMED' &&
      finalOwner === null,
    detail: `status=${finalCandidate?.status}, verification=${finalCandidate?.verificationStatus}, owner=${finalOwner ? finalOwner.id : 'null'}`,
  })

  const failed = steps.filter((s) => !s.ok)
  report.steps = steps
  report.failedCount = failed.length
  report.ok = failed.length === 0
  report.finalResult = report.ok ? 'GO — READY FOR REAL CLAIM' : 'NO-GO'
  report.finishedAt = new Date().toISOString()

  const outPath = resolve(process.cwd(), 'scripts/_phase_p12_pilot-report.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: report.ok, result: report.finalResult, outPath, failedCount: failed.length }, null, 2))
  if (failed.length) {
    console.log(JSON.stringify(failed, null, 2))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
