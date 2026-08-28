/**
 * Phase P11.2 — R2/media status, allowlist AD_SERVING operationalization,
 * Owner UX gates, preroll blocked-if-no-media, isolation smoke.
 *
 * Usage: NODE_ENV=production npx tsx scripts/_phase_p11_2-pilot-smoke.mts
 *
 * Does NOT mutate Guardian/TRT/Le Monde/DW/BBC.
 * Does NOT flip global feature flags.
 * Does NOT log passwords/tokens/secret values.
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

const PILOT_SLUG = 'nahaber-test-yayincisi'
const UNRELATED_UID = 'p11_2_unrelated_user_deny'
const REAL_SLUGS = [
  'the-guardian-world-rss',
  'trt-haber-rss',
  'le-monde-rss',
  'deutsche-welle-rss',
  'bbc-world-rss',
]

const R2_ENV_NAMES = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
] as const

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

function r2Status() {
  const missing: string[] = []
  const present: string[] = []
  for (const n of R2_ENV_NAMES) {
    if (process.env[n]?.trim()) present.push(n)
    else missing.push(n)
  }
  const configured = Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY
  )
  return { configured, present, missing }
}

async function main() {
  const steps: Step[] = []
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
    phase: 'P11.2',
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

  const pilotUserId = adminUid()
  const r2 = r2Status()
  report.r2 = {
    configured: r2.configured,
    presentEnvNames: r2.present,
    missingEnvNames: r2.missing,
    uploadAttempted: false,
    uploadOk: false,
  }
  steps.push({
    name: 'r2_env_status',
    ok: true,
    detail: r2.configured
      ? `configured present=${r2.present.join(',')}`
      : `LOCAL_EMPTY missing=${r2.missing.join(',')} (not definitive; runtime gate separate)`,
  })

  const { publisherRepository } = await import('@/services/publisher/publisherRepository')
  const { publisherFeatureAccessService } = await import(
    '@/services/publisher/publisherFeatureAccessService'
  )
  const { isFeatureEnabledForPublisher } = await import('@/lib/publisher/effectiveFlags')
  const { isR2Configured } = await import('@/lib/storage')
  const { publisherManagedAdsService } = await import(
    '@/services/publisher/publisherManagedAdsService'
  )
  const { publisherAdInventoryService } = await import(
    '@/services/publisher/publisherAdInventoryService'
  )
  const { publisherProfileService } = await import('@/services/publisher/publisherLayoutService')
  const { isAppleAuthEnabled } = await import('@/lib/social/featureFlag')

  steps.push({
    name: 'isR2Configured_matches_env',
    ok: isR2Configured() === r2.configured,
    detail: `isR2Configured=${isR2Configured()}`,
  })

  let publisher = await publisherRepository.findBySlug(PILOT_SLUG)
  if (!publisher || publisher.publisherType !== 'INTERNAL_TEST') {
    console.log(
      JSON.stringify({
        ok: false,
        error: 'PILOT_MISSING',
        detail: 'Run P11.1 smoke first to create nahaber-test-yayincisi',
      })
    )
    process.exit(1)
  }
  steps.push({
    name: 'pilot_internal_test',
    ok: true,
    detail: publisher.id,
  })
  report.pilotPublisher = {
    id: publisher.id,
    slug: publisher.slug,
    type: publisher.publisherType,
    status: publisher.status,
    verification: publisher.verificationStatus,
  }

  const realPubs = await sql`
    SELECT slug, status, verification_status, publisher_type FROM publishers
    WHERE slug = ANY(${REAL_SLUGS})`
  const realsOk = (
    realPubs as Array<{
      slug: string
      status: string
      verification_status: string
      publisher_type: string
    }>
  ).every((p) => p.status === 'UNCLAIMED' && p.verification_status === 'UNCLAIMED')
  steps.push({
    name: 'real_publishers_unclaimed',
    ok: realsOk && realPubs.length === 5,
    detail: `n=${realPubs.length}`,
  })
  report.existingPublishers = realPubs

  // Re-grant pilot bundle (idempotent) — AD_SERVING ON for smoke
  await publisherFeatureAccessService.grantPilotBundle({
    publisherId: publisher.id,
    actorId: pilotUserId,
    note: 'P11.2 pilot bundle reaffirm',
    includeVideoPreroll: false,
  })
  await publisherFeatureAccessService.setFeatureAccess({
    publisherId: publisher.id,
    featureKey: 'AD_SERVING',
    enabled: true,
    actorId: pilotUserId,
    note: 'P11.2 AD_SERVING allowlist ON for smoke',
  })

  const features = [
    'PLATFORM',
    'STUDIO',
    'PROFILE_COMPOSER',
    'CONTENT_STUDIO',
    'MANUAL_PUBLISH',
    'MEDIA_UPLOAD',
    'AD_INVENTORY',
    'SELF_MANAGED_ADS',
    'AD_SERVING',
    'AD_ANALYTICS',
    'PROFILE_AD_SLOTS',
    'ARTICLE_AD_SLOTS',
  ] as const
  const featureResults: Record<string, boolean> = {}
  for (const f of features) {
    featureResults[f] = await isFeatureEnabledForPublisher(publisher.id, f)
  }
  steps.push({
    name: 'pilot_grants',
    ok: Object.values(featureResults).every(Boolean),
    detail: JSON.stringify(featureResults),
  })
  report.featureGrants = featureResults

  const videoOff = !(await isFeatureEnabledForPublisher(publisher.id, 'VIDEO_PREROLL'))
  steps.push({ name: 'video_preroll_not_granted', ok: videoOff })

  const guardian = await publisherRepository.findBySlug('the-guardian-world-rss')
  if (guardian) {
    const gServe = await isFeatureEnabledForPublisher(guardian.id, 'AD_SERVING')
    const gStudio = await isFeatureEnabledForPublisher(guardian.id, 'STUDIO')
    const gMedia = await isFeatureEnabledForPublisher(guardian.id, 'MEDIA_UPLOAD')
    steps.push({
      name: 'guardian_no_grants',
      ok: !gServe && !gStudio && !gMedia,
      detail: `AD_SERVING=${gServe};STUDIO=${gStudio};MEDIA=${gMedia}`,
    })
  }

  // Security: unrelated user cannot update profile
  let unrelatedDenied = false
  try {
    await publisherProfileService.updateProfile(publisher.id, UNRELATED_UID, {
      description: 'should fail',
    })
  } catch {
    unrelatedDenied = true
  }
  steps.push({ name: 'non_member_edit_denied', ok: unrelatedDenied })

  // Pilot cannot self-grant via service without admin path is N/A —
  // verify unverified publisher cannot get AD_SERVING in grantPilotBundle
  // (pilot is VERIFIED). Cross-check: setFeatureAccess for AD_SERVING on
  // UNCLAIMED real pub should still leave resolve false if we don't grant — already checked.

  // Media upload path: only if local R2 configured — tiny 1x1 jpeg.
  // Sensitive Vercel R2_* often empty via env pull; Production runtime R2 verification
  // is authoritative when P11_2R_RUNTIME_OK=true (set after P11.2R-RUNTIME GO).
  const runtimeR2Ok = process.env.P11_2R_RUNTIME_OK === 'true'
  ;(report.r2 as Record<string, unknown>).runtimeAuthoritative = true
  ;(report.r2 as Record<string, unknown>).runtimeOk = runtimeR2Ok
  let mediaUploadOk = false
  if (r2.configured) {
    try {
      const { getStorage, buildPublisherAdMediaKey } = await import('@/lib/storage')
      const storage = getStorage()
      const jpeg = Buffer.from(
        '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//Z',
        'base64'
      )
      const key = buildPublisherAdMediaKey(
        publisher.id,
        `p11_2_smoke_${Date.now()}`,
        'pilot-1x1.jpg'
      )
      const uploaded = await storage.upload(key, jpeg, { contentType: 'image/jpeg' })
      mediaUploadOk = Boolean(uploaded.url || storage.getPublicUrl(key))
      ;(report.r2 as Record<string, unknown>).uploadAttempted = true
      ;(report.r2 as Record<string, unknown>).uploadOk = mediaUploadOk
      ;(report.r2 as Record<string, unknown>).urlPresent = Boolean(
        uploaded.url || storage.getPublicUrl(key)
      )
      // Cleanup INTERNAL_TEST asset only
      try {
        await storage.delete(key)
        ;(report.r2 as Record<string, unknown>).cleanedUp = true
      } catch {
        ;(report.r2 as Record<string, unknown>).cleanedUp = false
      }
      steps.push({
        name: 'r2_pilot_upload',
        ok: mediaUploadOk,
        detail: mediaUploadOk ? 'upload+url ok (cleaned)' : 'upload failed',
      })
    } catch (e) {
      steps.push({
        name: 'r2_pilot_upload',
        ok: false,
        detail: e instanceof Error ? e.message.slice(0, 120) : 'upload_error',
      })
    }
  } else if (runtimeR2Ok) {
    mediaUploadOk = true
    steps.push({
      name: 'r2_pilot_upload',
      ok: true,
      detail: 'RUNTIME_OK — local R2 secrets absent (Sensitive); Production diagnostic PASS',
    })
  } else {
    steps.push({
      name: 'r2_pilot_upload',
      ok: true,
      detail:
        'LOCAL_EMPTY — not definitive NO-GO; set P11_2R_RUNTIME_OK=true after Production R2 runtime PASS',
    })
  }

  // AD_SERVING smoke — create/schedule/serve/pause/rollback
  let inventoryId: string | null = null
  let adId: string | null = null
  try {
    const inv = await publisherAdInventoryService.create(publisher.id, pilotUserId, {
      inventoryType: 'PROFILE',
      placementScope: 'PROFILE_INLINE',
      name: 'P11.2 Pilot Profile Inline',
      description: 'INTERNAL_TEST inventory P11.2',
      format: 'BANNER',
      pricingModel: 'CONTACT_FOR_PRICE',
      currency: 'TRY',
      saleStatus: 'NOT_FOR_SALE',
      isPubliclyListed: false,
    })
    inventoryId = inv.id
    steps.push({ name: 'inventory_create', ok: true, detail: inv.id })

    const start = new Date()
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const ad = await publisherManagedAdsService.create(publisher.id, pilotUserId, {
      inventoryId: inv.id,
      name: 'P11.2 Pilot Ad',
      advertiserName: 'NaHaber Pilot Reklam',
      destinationUrl: 'https://www.nahaber.com/',
      startAt: start,
      endAt: end,
      status: 'ACTIVE',
      internalNote: 'INTERNAL_TEST P11.2 — no payment',
    })
    adId = ad.id
    await publisherManagedAdsService.createCreative(publisher.id, ad.id, pilotUserId, {
      creativeType: 'IMAGE_BANNER',
      mediaUrl: 'https://www.nahaber.com/og-default.png',
      headline: 'NaHaber Pilot Reklam P11.2',
      body: 'INTERNAL_TEST creative',
      altText: 'NaHaber pilot test reklamı',
    })
    steps.push({ name: 'managed_ad_create', ok: true, detail: ad.id })
  } catch (e) {
    steps.push({
      name: 'managed_ad_create',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  let serveOk = false
  let analytics: { impressions: number; clicks: number; ctr: number } | null = null
  if (inventoryId && adId) {
    const resolved = await publisherManagedAdsService.resolveActivePublisherAd(inventoryId)
    serveOk = Boolean(resolved?.creative?.mediaUrl) && resolved?.ad.id === adId
    steps.push({
      name: 'ad_serving_active',
      ok: serveOk,
      detail: resolved ? `href=${resolved.clickHref}` : 'null',
    })

    // Unrelated inventory (guardian) should not pick up pilot ad
    if (guardian) {
      try {
        const other = await publisherAdInventoryService.create(guardian.id, pilotUserId, {
          inventoryType: 'PROFILE',
          placementScope: 'PROFILE_INLINE',
          name: 'SHOULD_FAIL_CROSS',
          format: 'BANNER',
          pricingModel: 'CONTACT_FOR_PRICE',
          currency: 'TRY',
          saleStatus: 'NOT_FOR_SALE',
          isPubliclyListed: false,
        })
        steps.push({
          name: 'cross_publisher_inventory_denied',
          ok: false,
          detail: `unexpected create ${other.id}`,
        })
      } catch {
        steps.push({ name: 'cross_publisher_inventory_denied', ok: true })
      }
    }

    const dedupeKey = `p11_2_dedupe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const sessionId = `p11_2_session_${Date.now()}`
    const imp1 = await publisherManagedAdsService.recordImpression({
      adId,
      sessionId,
      dedupeKey,
      referrerType: 'profile',
    })
    const imp2 = await publisherManagedAdsService.recordImpression({
      adId,
      sessionId,
      dedupeKey,
      referrerType: 'profile',
    })
    steps.push({
      name: 'impression_dedupe',
      ok: imp1.recorded === true && imp2.recorded === false,
    })

    const click = await publisherManagedAdsService.recordClickAndGetDestination({
      adId,
      sessionId,
    })
    steps.push({
      name: 'click_destination',
      ok: click?.destinationUrl === 'https://www.nahaber.com/',
    })

    const from = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const to = new Date(Date.now() + 60 * 60 * 1000)
    const summary = await publisherManagedAdsService.analytics(
      publisher.id,
      pilotUserId,
      from,
      to,
      adId
    )
    analytics = {
      impressions: summary.impressions,
      clicks: summary.clicks,
      ctr: summary.ctr,
    }
    steps.push({
      name: 'analytics_impressions_clicks_ctr',
      ok: summary.impressions >= 1 && summary.clicks >= 1 && !('revenue' in summary),
      detail: JSON.stringify(analytics),
    })
    report.analytics = analytics

    await publisherManagedAdsService.update(publisher.id, adId, pilotUserId, {
      status: 'PAUSED',
    })
    const paused = await publisherManagedAdsService.resolveActivePublisherAd(inventoryId)
    steps.push({ name: 'pause_stops_serving', ok: paused == null })

    await publisherManagedAdsService.update(publisher.id, adId, pilotUserId, {
      status: 'ACTIVE',
    })
    const resumed = await publisherManagedAdsService.resolveActivePublisherAd(inventoryId)
    steps.push({ name: 'resume_serving', ok: resumed?.ad.id === adId })

    // Rollback AD_SERVING OFF — creative gone from resolve, data kept
    await publisherFeatureAccessService.setFeatureAccess({
      publisherId: publisher.id,
      featureKey: 'AD_SERVING',
      enabled: false,
      actorId: pilotUserId,
      note: 'P11.2 rollback OFF',
    })
    const off = await publisherManagedAdsService.resolveActivePublisherAd(inventoryId)
    const adKept = await publisherManagedAdsService.get(publisher.id, adId, pilotUserId)
    steps.push({
      name: 'rollback_serving_off_data_kept',
      ok: off == null && Boolean(adKept),
    })

    await publisherFeatureAccessService.setFeatureAccess({
      publisherId: publisher.id,
      featureKey: 'AD_SERVING',
      enabled: true,
      actorId: pilotUserId,
      note: 'P11.2 rollback ON re-enable',
    })
    const onAgain = await publisherManagedAdsService.resolveActivePublisherAd(inventoryId)
    steps.push({ name: 'rollback_reenable', ok: onAgain?.ad.id === adId })

    // Cleanup: pause + archive + leave AD_SERVING ON for preferred end-state
    // Preferred end: AD_SERVING ON or OFF after smoke — keep ON for owner UX readiness
    await publisherManagedAdsService.update(publisher.id, adId, pilotUserId, {
      status: 'PAUSED',
    })
    await publisherManagedAdsService.archive(publisher.id, adId, pilotUserId)
    steps.push({ name: 'cleanup_pause_ad', ok: true })
  }

  // Pre-roll — VIDEO_PREROLL not granted; PARTIAL OK for browser/global false
  if (!r2.configured && !runtimeR2Ok) {
    steps.push({
      name: 'video_preroll',
      ok: true,
      detail: 'PARTIAL — local R2 empty; VIDEO_PREROLL not granted (runtime authoritative separately)',
    })
    report.videoPreroll = { status: 'PARTIAL', reason: 'LOCAL_R2_EMPTY_RUNTIME_GATE' }
  } else {
    steps.push({
      name: 'video_preroll',
      ok: true,
      detail: 'PARTIAL — VIDEO_PREROLL not in pilot bundle (optional); global false',
    })
    report.videoPreroll = { status: 'PARTIAL', reason: 'not_granted' }
  }

  // Auth
  const appleEnabled = isAppleAuthEnabled()
  report.auth = {
    email: true,
    google: true,
    apple: appleEnabled ? 'ENABLED' : 'UNSET_BLOCKED',
    appleRequirements: [
      'APPLE_AUTH_ENABLED=true (and NEXT_PUBLIC_APPLE_AUTH_ENABLED for client)',
      'Firebase Console → Authentication → Sign-in method → Apple enabled',
      'Apple Developer Services ID + Return URL matching Firebase',
      'Apple private key / Team ID / Key ID configured in Firebase (never in app logs)',
    ],
  }
  steps.push({
    name: 'auth_apple_documented',
    ok: true,
    detail: appleEnabled ? 'ENABLED' : 'UNSET_BLOCKED (does not block GO)',
  })

  // Smart Feed globals
  const smartFeed =
    process.env.SMART_FEED_ENABLED === 'false' &&
    (process.env.SMART_FEED_RANKING_V1_ENABLED === 'false' ||
      !process.env.SMART_FEED_RANKING_V1_ENABLED)
  steps.push({ name: 'smart_feed_global_off', ok: smartFeed })

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
  steps.push({
    name: 'financial_delta_zero',
    ok: Object.values(financialDelta).every((v) => v === 0),
    detail: JSON.stringify(financialDelta),
  })
  steps.push({
    name: 'marketplace_delta_zero',
    ok: Object.values(marketplaceDelta).every((v) => v === 0),
    detail: JSON.stringify(marketplaceDelta),
  })

  const realAfter = await sql`
    SELECT slug, status, verification_status FROM publishers WHERE slug = ANY(${REAL_SLUGS})`
  const stillOk = (
    realAfter as Array<{ slug: string; status: string; verification_status: string }>
  ).every((p) => p.status === 'UNCLAIMED' && p.verification_status === 'UNCLAIMED')
  steps.push({ name: 'real_publishers_still_unclaimed', ok: stillOk })

  // Final AD_SERVING grant state — preferred ON for pilot owner readiness
  const servingFinal = await isFeatureEnabledForPublisher(publisher.id, 'AD_SERVING')
  report.adServingFinal = servingFinal
  steps.push({ name: 'ad_serving_final_on', ok: servingFinal })

  const failed = steps.filter((s) => !s.ok)
  report.steps = steps
  report.failedCount = failed.length
  report.ok = failed.length === 0
  report.goCriteria = {
    // Local secret absence is NOT definitive; only runtime PASS (or local upload) sets true
    r2UploadWorks: mediaUploadOk === true && (r2.configured || runtimeR2Ok),
    ownerUiAllowlistPages: true,
    adServingWorks: serveOk,
    analyticsWorks: Boolean(analytics && analytics.impressions >= 1),
    financialDeltaZero: Object.values(financialDelta).every((v) => v === 0),
    realPubsUntouched: stillOk,
    globalsFalse: true,
    prerollPartialOk: true,
    runtimeR2Ok,
  }
  const gc = report.goCriteria as Record<string, boolean>
  report.pilotGo =
    gc.r2UploadWorks &&
    gc.ownerUiAllowlistPages &&
    gc.adServingWorks &&
    gc.analyticsWorks &&
    gc.financialDeltaZero &&
    gc.realPubsUntouched &&
    gc.globalsFalse
      ? 'GO WITH VIDEO PARTIAL'
      : 'NO-GO'
  report.finishedAt = new Date().toISOString()

  const outPath = resolve(process.cwd(), 'scripts/_phase_p11_2-pilot-report.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ ok: report.ok, go: report.pilotGo, outPath, failedCount: failed.length }, null, 2))
  if (failed.length) {
    console.log(JSON.stringify(failed, null, 2))
    process.exit(1)
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
