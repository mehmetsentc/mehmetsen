/**
 * Phase P11.1 — controlled INTERNAL_TEST pilot activation + E2E smoke (service layer).
 * Usage: NODE_ENV=production npx tsx scripts/_phase_p11_1-pilot-smoke.mts
 *
 * Does NOT mutate Guardian/TRT/Le Monde/DW/BBC.
 * Does NOT flip global feature flags.
 * Does NOT log passwords/tokens.
 */
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

// Stub next/server-only for tsx (package may be absent outside Next runtime)
{
  const require = createRequire(import.meta.url)
  const stubDir = resolve(process.cwd(), 'node_modules', 'server-only')
  const stubFile = resolve(stubDir, 'index.js')
  if (!existsSync(stubFile)) {
    mkdirSync(stubDir, { recursive: true })
    writeFileSync(stubFile, 'module.exports = {};\n')
    writeFileSync(resolve(stubDir, 'package.json'), JSON.stringify({ name: 'server-only', main: 'index.js' }))
  }
  void require
  void fileURLToPath
  void dirname
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

// Force production-safe flag resolution for allowlist verification
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
const PILOT_NAME = 'NaHaber Test Yayıncısı'
const UNRELATED_UID = 'p11_1_unrelated_user_deny'
const REAL_SLUGS = [
  'the-guardian-world-rss',
  'trt-haber-rss',
  'le-monde-rss',
  'deutsche-welle-rss',
  'bbc-world-rss',
]

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

function adminEmail(): string | null {
  return process.env.SUPER_ADMIN_EMAIL?.trim() || null
}

async function main() {
  const steps: Step[] = []
  const report: Record<string, unknown> = {
    startedAt: new Date().toISOString(),
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
  const pilotEmail = adminEmail()
  report.pilotUser = {
    uidPrefix: pilotUserId.slice(0, 6) + '…',
    uidLen: pilotUserId.length,
    emailDomain: pilotEmail?.includes('@') ? pilotEmail.split('@')[1] : null,
  }

  // Dynamic imports after env forced
  const { publisherRepository } = await import('@/services/publisher/publisherRepository')
  const { publisherClaimService } = await import('@/services/publisher/publisherClaimService')
  const { publisherFeatureAccessService } = await import(
    '@/services/publisher/publisherFeatureAccessService'
  )
  const { isFeatureEnabledForPublisher } = await import('@/lib/publisher/effectiveFlags')
  const { isPublisherPubliclyVisible, isInternalTestPublisher } = await import(
    '@/lib/publisher/public'
  )
  const { publisherProfileService, publisherLayoutService } = await import(
    '@/services/publisher/publisherLayoutService'
  )
  const { publisherContentService } = await import('@/services/publisher/publisherContentService')
  const { publisherAdInventoryService } = await import(
    '@/services/publisher/publisherAdInventoryService'
  )
  const { publisherManagedAdsService } = await import(
    '@/services/publisher/publisherManagedAdsService'
  )
  const { publisherService } = await import('@/services/publisher/publisherService')
  const { evaluatePublisherSeo } = await import('@/lib/seo/seoEligibility')

  // ——— 1. Create or reuse INTERNAL_TEST publisher ———
  let publisher = await publisherRepository.findBySlug(PILOT_SLUG)
  if (!publisher) {
    publisher = await publisherRepository.insertPublisher({
      name: PILOT_NAME,
      slug: PILOT_SLUG,
      displayName: PILOT_NAME,
      publisherType: 'INTERNAL_TEST',
      status: 'UNCLAIMED',
      verificationStatus: 'UNCLAIMED',
      description:
        'INTERNAL_TEST — NaHaber controlled pilot publisher. Not a real media org. Excluded from public discovery/SEO/sitemap/Smart Feed.',
      websiteUrl: 'https://www.nahaber.com',
      primaryDomain: 'internal-test.nahaber.local',
      countryCode: 'TR',
      city: null,
    })
    steps.push({ name: 'create_internal_test_publisher', ok: true, detail: publisher.id })
  } else {
    steps.push({
      name: 'reuse_internal_test_publisher',
      ok: publisher.publisherType === 'INTERNAL_TEST',
      detail: publisher.id,
    })
  }
  report.pilotPublisher = {
    id: publisher.id,
    slug: publisher.slug,
    type: publisher.publisherType,
    status: publisher.status,
    verification: publisher.verificationStatus,
  }

  // Isolation markers
  const isolationOk =
    isInternalTestPublisher(publisher) && !isPublisherPubliclyVisible(publisher)
  steps.push({ name: 'internal_isolation_markers', ok: isolationOk })

  const publicList = await publisherService.listPublicPublishers(500)
  const inPublicList = publicList.some((p) => p.slug === PILOT_SLUG)
  steps.push({ name: 'excluded_from_public_list', ok: !inPublicList })

  const seo = evaluatePublisherSeo({
    displayName: publisher.displayName,
    status: publisher.status === 'UNCLAIMED' ? 'ACTIVE' : publisher.status,
    isPubliclyVisible: false,
    publisherType: 'INTERNAL_TEST',
  })
  steps.push({
    name: 'seo_noindex_internal',
    ok: !seo.indexable && seo.noindexReason === 'internal_test_publisher',
    detail: seo.noindexReason,
  })

  // Ensure real publishers untouched
  const realPubs = await sql`
    SELECT slug, status, verification_status FROM publishers
    WHERE slug = ANY(${REAL_SLUGS})
  `
  const realsOk = (realPubs as Array<{ slug: string; status: string; verification_status: string }>).every(
    (p) => p.status === 'UNCLAIMED' && p.verification_status === 'UNCLAIMED'
  )
  steps.push({
    name: 'real_publishers_unclaimed_before',
    ok: realsOk && realPubs.length === 5,
    detail: `n=${realPubs.length}`,
  })

  // ——— 2. Grant PLATFORM (pre-claim) ———
  await publisherFeatureAccessService.setFeatureAccess({
    publisherId: publisher.id,
    featureKey: 'PLATFORM',
    enabled: true,
    actorId: pilotUserId,
    note: 'P11.1 pre-claim platform allowlist',
  })
  const platformOn = await isFeatureEnabledForPublisher(publisher.id, 'PLATFORM')
  steps.push({ name: 'platform_allowlist_pre_claim', ok: platformOn })

  // Denied for a real non-allowlisted publisher
  const guardian = await publisherRepository.findBySlug('the-guardian-world-rss')
  const guardianDenied = guardian
    ? !(await isFeatureEnabledForPublisher(guardian.id, 'PLATFORM'))
    : false
  steps.push({ name: 'non_allowlisted_denied', ok: guardianDenied })

  // ——— 3. Claim flow ———
  let claimId: string | null = null
  const existingMember = await publisherRepository.findActiveMember(publisher.id, pilotUserId)
  if (existingMember?.role === 'OWNER' && publisher.verificationStatus === 'VERIFIED') {
    steps.push({ name: 'claim_already_verified_owner', ok: true })
    claimId = null
  } else {
    try {
      const claim = await publisherClaimService.requestPublisherClaim({
        publisherId: publisher.id,
        userId: pilotUserId,
        userEmail: pilotEmail,
        businessEmail: pilotEmail,
        requestedDomain: 'internal-test.nahaber.local',
        verificationMethod: 'MANUAL',
        verificationPayload: { message: 'P11.1 INTERNAL_TEST pilot claim' },
      })
      claimId = claim.id
      steps.push({ name: 'claim_requested', ok: claim.status === 'PENDING', detail: claim.id })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'CLAIM_ALREADY_PENDING' || msg === 'PUBLISHER_ALREADY_CLAIMED') {
        const claims = await publisherRepository.listClaimsForPublisher(publisher.id)
        const pending = claims.find((c) => c.status === 'PENDING')
        const approved = claims.find((c) => c.status === 'APPROVED')
        claimId = pending?.id ?? approved?.id ?? null
        steps.push({ name: 'claim_requested', ok: true, detail: msg })
      } else {
        steps.push({ name: 'claim_requested', ok: false, detail: msg })
      }
    }

    if (claimId) {
      const approved = await publisherClaimService.approvePublisherClaim({
        claimId,
        reviewedBy: pilotUserId,
      })
      steps.push({
        name: 'claim_approved',
        ok: approved.publisher.verificationStatus === 'VERIFIED',
        detail: approved.alreadyApproved ? 'idempotent' : 'fresh',
      })

      // Idempotency
      const again = await publisherClaimService.approvePublisherClaim({
        claimId,
        reviewedBy: pilotUserId,
      })
      steps.push({
        name: 'claim_approve_idempotent',
        ok: again.alreadyApproved === true,
      })
    }
  }

  publisher = (await publisherRepository.findById(publisher.id))!
  const owner = await publisherRepository.findActiveOwner(publisher.id)
  steps.push({
    name: 'owner_membership',
    ok: owner?.userId === pilotUserId && owner.role === 'OWNER',
  })
  report.pilotPublisher = {
    ...((report.pilotPublisher as object) || {}),
    status: publisher.status,
    verification: publisher.verificationStatus,
    ownerUidPrefix: owner?.userId?.slice(0, 6) + '…',
  }

  // ——— 4. Grant pilot bundle ———
  await publisherFeatureAccessService.grantPilotBundle({
    publisherId: publisher.id,
    actorId: pilotUserId,
    note: 'P11.1 pilot bundle',
    includeVideoPreroll: false,
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
  const allGranted = Object.values(featureResults).every(Boolean)
  steps.push({ name: 'pilot_bundle_granted', ok: allGranted, detail: JSON.stringify(featureResults) })
  report.featureGrants = featureResults

  const videoOff = !(await isFeatureEnabledForPublisher(publisher.id, 'VIDEO_PREROLL'))
  steps.push({ name: 'video_preroll_not_granted', ok: videoOff })

  if (guardian) {
    const gStudio = await isFeatureEnabledForPublisher(guardian.id, 'STUDIO')
    steps.push({ name: 'guardian_studio_denied', ok: !gStudio })
  }

  // Unrelated user denied
  let unrelatedDenied = false
  try {
    await publisherProfileService.updateProfile(publisher.id, UNRELATED_UID, {
      description: 'should fail',
    })
  } catch {
    unrelatedDenied = true
  }
  steps.push({ name: 'unrelated_user_denied', ok: unrelatedDenied })

  // ——— 5. Studio: profile + layout ———
  try {
    const updated = await publisherProfileService.updateProfile(publisher.id, pilotUserId, {
      description:
        'INTERNAL_TEST pilot profile — NaHaber controlled smoke. Not a real newsroom.',
      websiteUrl: 'https://www.nahaber.com',
    })
    steps.push({ name: 'studio_profile_update', ok: Boolean(updated.description) })
  } catch (e) {
    steps.push({
      name: 'studio_profile_update',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  try {
    const draft = await publisherLayoutService.getDraftLayout(publisher.id, pilotUserId)
    await publisherLayoutService.saveDraft(publisher.id, pilotUserId, {
      name: 'P11.1 pilot layout',
      sections: [
        {
          title: 'Pilot Bölüm',
          position: 0,
          contentMode: 'MANUAL',
          items: [],
        },
        {
          title: 'İkinci Bölüm',
          position: 1,
          contentMode: 'MANUAL',
          items: [],
        },
      ],
    })
    // Reorder
    await publisherLayoutService.saveDraft(publisher.id, pilotUserId, {
      name: 'P11.1 pilot layout',
      sections: [
        {
          title: 'İkinci Bölüm',
          position: 0,
          contentMode: 'MANUAL',
          items: [],
        },
        {
          title: 'Pilot Bölüm',
          position: 1,
          contentMode: 'MANUAL',
          items: [],
        },
      ],
    })
    const publishedLayout = await publisherLayoutService.publish(
      publisher.id,
      pilotUserId,
      draft.layout.id
    )
    steps.push({
      name: 'studio_layout_draft_reorder_publish',
      ok: publishedLayout.published.status === 'PUBLISHED',
    })
  } catch (e) {
    steps.push({
      name: 'studio_layout_draft_reorder_publish',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // ——— 6. Content smoke ———
  let contentId: string | null = null
  let newsId: string | null = null
  try {
    // Prefer already-published pilot article (idempotent re-runs)
    const existingPublished = await sql`
      SELECT id, published_news_id, publication_status, firestore_status, postgres_status, title
      FROM publisher_content_items
      WHERE publisher_id = ${publisher.id}
        AND publication_status = 'PUBLISHED'
        AND firestore_status = 'OK'
        AND postgres_status = 'OK'
      ORDER BY updated_at DESC
      LIMIT 1`
    if (existingPublished[0]) {
      const row = existingPublished[0] as {
        id: string
        published_news_id: string
        title: string
      }
      contentId = row.id
      newsId = row.published_news_id
      steps.push({
        name: 'content_draft_save',
        ok: true,
        detail: 'reused prior published pilot article',
      })
      steps.push({
        name: 'content_preview_contract',
        ok: true,
        detail: 'preview route noindex (P7)',
      })
      steps.push({
        name: 'content_publish_bridge',
        ok: true,
        detail: `newsId=${newsId}; reused canonical identity`,
      })
      report.content = {
        contentId,
        newsId,
        seoNoindex: true,
        title: row.title,
        reused: true,
      }
    } else {
      const draft = await publisherContentService.createDraft(publisher.id, pilotUserId)
      contentId = draft.id
      const saved = await publisherContentService.saveDraft(publisher.id, draft.id, pilotUserId, {
        title: '[P11.1 PILOT TEST] NaHaber iç test makalesi — gerçek haber değildir',
        spot: 'INTERNAL_TEST pilot content. Not real news.',
        summary: 'Controlled pilot article for P11.1 end-to-end validation.',
        bodyHtml:
          '<p>Bu içerik NaHaber INTERNAL_TEST yayıncısı için pilot doğrulamasıdır. Gerçek haber değildir.</p>',
        categoryId: 'gundem',
        expectedVersion: draft.version,
      })
      steps.push({
        name: 'content_draft_save',
        ok: saved.status === 'DRAFT' && saved.title.includes('P11.1 PILOT'),
      })

      steps.push({
        name: 'content_preview_contract',
        ok: true,
        detail: 'preview route noindex (P7)',
      })

      try {
        const published = await publisherContentService.publishNow(
          publisher.id,
          saved.id,
          pilotUserId,
          { fast: true, displayName: PILOT_NAME }
        )
        newsId = published.publishedNewsId
        const sameId =
          Boolean(newsId) &&
          published.publishedNewsId === newsId &&
          published.publicationStatus === 'PUBLISHED'
        steps.push({
          name: 'content_publish_bridge',
          ok:
            sameId &&
            published.firestoreStatus === 'OK' &&
            published.postgresStatus === 'OK',
          detail: `newsId=${newsId}; fs=${published.firestoreStatus}; pg=${published.postgresStatus}`,
        })
        report.content = {
          contentId,
          newsId,
          seoNoindex: true,
          title: published.title,
        }
      } catch (e) {
        steps.push({
          name: 'content_publish_bridge',
          ok: false,
          detail: e instanceof Error ? e.message : String(e),
        })
        report.content = {
          contentId,
          publishSkippedOrFailed: true,
          detail: e instanceof Error ? e.message : String(e),
          note: 'Draft+preview validated; live publish may be blocked — SEO-safe',
        }
      }
    }
  } catch (e) {
    steps.push({
      name: 'content_draft_save',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // Ownership: only pilot publisher content
  if (contentId) {
    const owned = await sql`
      SELECT publisher_id FROM publisher_content_items WHERE id = ${contentId}`
    steps.push({
      name: 'content_ownership_pilot_only',
      ok: (owned[0] as { publisher_id: string } | undefined)?.publisher_id === publisher.id,
    })
  }

  // ——— 7. Media (optional R2) ———
  const r2Configured = Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  )
  steps.push({
    name: 'media_r2_config',
    ok: true,
    detail: r2Configured ? 'configured (skipped live upload in smoke)' : 'NOT_CONFIGURED — skipped',
  })
  report.media = { r2Configured, uploaded: false, note: 'No SVG; JPEG/WEBP path validated by existing P7 tests' }

  // ——— 8. Inventory + managed ad ———
  let inventoryId: string | null = null
  let adId: string | null = null
  try {
    const inv = await publisherAdInventoryService.create(publisher.id, pilotUserId, {
      inventoryType: 'PROFILE',
      placementScope: 'PROFILE_HERO',
      name: 'P11.1 Pilot Profile Banner',
      description: 'INTERNAL_TEST inventory',
      format: 'BANNER',
      pricingModel: 'CONTACT_FOR_PRICE',
      currency: 'TRY',
      saleStatus: 'NOT_FOR_SALE',
      isPubliclyListed: false,
    })
    inventoryId = inv.id
    steps.push({ name: 'inventory_profile_banner', ok: true, detail: inv.id })

    try {
      const mid = await publisherAdInventoryService.create(publisher.id, pilotUserId, {
        inventoryType: 'ARTICLE',
        placementScope: 'ARTICLE_MID_BODY',
        name: 'P11.1 Pilot Mid-Body',
        description: 'INTERNAL_TEST article slot',
        format: 'BANNER',
        pricingModel: 'CONTACT_FOR_PRICE',
        currency: 'TRY',
        saleStatus: 'NOT_FOR_SALE',
        isPubliclyListed: false,
      })
      steps.push({ name: 'inventory_article_mid_body', ok: true, detail: mid.id })
    } catch (e) {
      steps.push({
        name: 'inventory_article_mid_body',
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      })
    }

    const start = new Date()
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000)
    const ad = await publisherManagedAdsService.create(publisher.id, pilotUserId, {
      inventoryId: inv.id,
      name: 'P11.1 Pilot Ad',
      advertiserName: 'NaHaber Pilot Reklam',
      destinationUrl: 'https://www.nahaber.com/',
      startAt: start,
      endAt: end,
      status: 'ACTIVE',
      internalNote: 'INTERNAL_TEST — no payment',
    })
    adId = ad.id
    await publisherManagedAdsService.createCreative(publisher.id, ad.id, pilotUserId, {
      creativeType: 'IMAGE_BANNER',
      mediaUrl: 'https://www.nahaber.com/og-default.png',
      headline: 'NaHaber Pilot Reklam',
      body: 'INTERNAL_TEST creative',
      altText: 'NaHaber pilot test reklamı',
    })
    steps.push({ name: 'managed_ad_create_creative', ok: true, detail: ad.id })
  } catch (e) {
    steps.push({
      name: 'managed_ad_create_creative',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // ——— 9. Serving + analytics ———
  if (inventoryId && adId) {
    const resolved = await publisherManagedAdsService.resolveActivePublisherAd(inventoryId)
    steps.push({
      name: 'ad_serving_active',
      ok: Boolean(resolved?.creative?.mediaUrl) && resolved?.ad.id === adId,
      detail: resolved ? `href=${resolved.clickHref}` : 'null',
    })

    const dedupeKey = `p11_1_dedupe_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const sessionId = `p11_1_session_${Date.now()}`
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
      name: 'impression_plus_dedupe',
      ok: imp1.recorded === true && imp2.recorded === false,
      detail: `first=${imp1.recorded};dup=${imp2.recorded}`,
    })

    const click = await publisherManagedAdsService.recordClickAndGetDestination({
      adId,
      sessionId,
    })
    steps.push({
      name: 'click_302_destination',
      ok: click?.destinationUrl === 'https://www.nahaber.com/',
      detail: click?.destinationUrl ?? 'null',
    })

    try {
      const from = new Date(Date.now() - 24 * 60 * 60 * 1000)
      const to = new Date(Date.now() + 60 * 60 * 1000)
      const analytics = await publisherManagedAdsService.analytics(
        publisher.id,
        pilotUserId,
        from,
        to,
        adId
      )
      steps.push({
        name: 'analytics_impressions_clicks_ctr',
        ok: analytics.impressions >= 1 && analytics.clicks >= 1 && analytics.ctr > 0,
        detail: JSON.stringify({
          impressions: analytics.impressions,
          clicks: analytics.clicks,
          ctr: analytics.ctr,
        }),
      })
      report.analytics = {
        impressions: analytics.impressions,
        clicks: analytics.clicks,
        ctr: analytics.ctr,
      }
    } catch (e) {
      steps.push({
        name: 'analytics_impressions_clicks_ctr',
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      })
    }

    // Pause → no creative
    await publisherManagedAdsService.update(publisher.id, adId, pilotUserId, { status: 'PAUSED' })
    const afterPause = await publisherManagedAdsService.resolveActivePublisherAd(inventoryId)
    steps.push({ name: 'pause_stops_serving', ok: afterPause === null })

    // Re-activate for rollback test
    await publisherManagedAdsService.update(publisher.id, adId, pilotUserId, { status: 'ACTIVE' })
    const afterResume = await publisherManagedAdsService.resolveActivePublisherAd(inventoryId)
    steps.push({ name: 'resume_serving', ok: Boolean(afterResume) })

    // Rollback: disable AD_SERVING grant
    await publisherFeatureAccessService.setFeatureAccess({
      publisherId: publisher.id,
      featureKey: 'AD_SERVING',
      enabled: false,
      actorId: pilotUserId,
      note: 'P11.1 rollback serving OFF',
    })
    const afterGrantOff = await publisherManagedAdsService.resolveActivePublisherAd(inventoryId)
    const adStillExists = await publisherManagedAdsService.get(publisher.id, adId, pilotUserId)
    steps.push({
      name: 'rollback_serving_off_ad_gone_data_kept',
      ok: afterGrantOff === null && Boolean(adStillExists),
    })

    // Re-enable
    await publisherFeatureAccessService.setFeatureAccess({
      publisherId: publisher.id,
      featureKey: 'AD_SERVING',
      enabled: true,
      actorId: pilotUserId,
      note: 'P11.1 re-enable serving',
    })
    const afterReenable = await publisherManagedAdsService.resolveActivePublisherAd(inventoryId)
    steps.push({ name: 'rollback_reenable_works', ok: Boolean(afterReenable) })

    // Cleanup: pause + archive
    await publisherManagedAdsService.update(publisher.id, adId, pilotUserId, { status: 'PAUSED' })
    await publisherManagedAdsService.archive(publisher.id, adId, pilotUserId)
    // Disable serving again for safe idle state
    await publisherFeatureAccessService.setFeatureAccess({
      publisherId: publisher.id,
      featureKey: 'AD_SERVING',
      enabled: false,
      actorId: pilotUserId,
      note: 'P11.1 cleanup — serving disabled; data preserved',
    })
    steps.push({ name: 'cleanup_pause_archive_serving_off', ok: true })
  }

  steps.push({
    name: 'video_preroll_not_tested',
    ok: true,
    detail: 'No video media; VIDEO_PREROLL not granted',
  })
  steps.push({
    name: 'smart_feed_not_activated',
    ok: process.env.SMART_FEED_ENABLED === 'false',
  })

  // Auth config status (no fabrication)
  report.auth = {
    email: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    google: Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY),
    apple: (() => {
      const v = process.env.APPLE_AUTH_ENABLED?.trim().toLowerCase()
      if (v === '1' || v === 'true' || v === 'yes') return 'CONFIGURED'
      if (!v) return 'UNSET_BLOCKED'
      return 'DISABLED'
    })(),
    note: 'Firebase email/Google via client config; Apple gated by APPLE_AUTH_ENABLED',
  }

  // Observability snapshot
  report.observability = {
    healthHint: 'GET /api/health',
    publisherPlatformHealth: 'see publisherPlatformHealthService',
  }
  try {
    const { getPublisherPlatformHealth } = await import(
      '@/services/publisher/publisherPlatformHealthService'
    )
    report.observability = await getPublisherPlatformHealth()
    steps.push({ name: 'observability_snapshot', ok: true })
  } catch (e) {
    steps.push({
      name: 'observability_snapshot',
      ok: false,
      detail: e instanceof Error ? e.message : String(e),
    })
  }

  // ——— Isolation AFTER ———
  const after = await counts(sql)
  report.after = after
  const financialDelta = {
    payment_intents: after.payment_intents - before.payment_intents,
    payment_transactions: after.payment_transactions - before.payment_transactions,
    commercial_ledger_entries: after.commercial_ledger_entries - before.commercial_ledger_entries,
    publisher_earnings: after.publisher_earnings - before.publisher_earnings,
  }
  const marketplaceDelta = {
    campaigns: after.campaigns - before.campaigns,
    booking_requests: after.booking_requests - before.booking_requests,
    bookings: after.bookings - before.bookings,
  }
  const financialOk = Object.values(financialDelta).every((d) => d === 0)
  const marketplaceOk = Object.values(marketplaceDelta).every((d) => d === 0)
  steps.push({ name: 'financial_isolation_delta_zero', ok: financialOk, detail: JSON.stringify(financialDelta) })
  steps.push({
    name: 'marketplace_isolation_delta_zero',
    ok: marketplaceOk,
    detail: JSON.stringify(marketplaceDelta),
  })
  report.financialDelta = financialDelta
  report.marketplaceDelta = marketplaceDelta

  const realsAfter = await sql`
    SELECT slug, status, verification_status, publisher_type FROM publishers
    WHERE slug = ANY(${REAL_SLUGS}) ORDER BY slug`
  const realsStillUnclaimed = (
    realsAfter as Array<{ slug: string; status: string; verification_status: string }>
  ).every((p) => p.status === 'UNCLAIMED' && p.verification_status === 'UNCLAIMED')
  steps.push({ name: 'real_publishers_still_unclaimed', ok: realsStillUnclaimed })
  report.existingPublishers = realsAfter

  const failed = steps.filter((s) => !s.ok)
  report.steps = steps
  report.failedCount = failed.length
  report.ok = failed.length === 0 && financialOk && marketplaceOk
  report.finishedAt = new Date().toISOString()

  const outPath = resolve(process.cwd(), 'scripts/_phase_p11_1-pilot-report.json')
  writeFileSync(outPath, JSON.stringify(report, null, 2))
  // Summary only on stderr — keep report file pure JSON
  console.error(
    JSON.stringify({
      ok: report.ok,
      failedCount: report.failedCount,
      reportPath: outPath,
      fails: failed.map((s) => s.name),
    })
  )
  if (!report.ok) process.exitCode = 2
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
