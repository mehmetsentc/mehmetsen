/**
 * Phase P11 — central rollout matrix + feature dependency graph.
 * Wrong combinations safely reject / fall back (never invent payment paths).
 */
import type {
  PublisherRolloutFeatureKey,
  PublisherRolloutStage,
} from '@/types/publisherRollout'

/** Env var that gates each feature globally (prod default false unless noted). */
export const FEATURE_ENV_KEYS: Record<PublisherRolloutFeatureKey, string> = {
  PLATFORM: 'PUBLISHER_PLATFORM_ENABLED',
  STUDIO: 'PUBLISHER_STUDIO_ENABLED',
  PROFILE_COMPOSER: 'PUBLISHER_PROFILE_COMPOSER_ENABLED',
  CONTENT_STUDIO: 'PUBLISHER_CONTENT_STUDIO_ENABLED',
  MANUAL_PUBLISH: 'PUBLISHER_MANUAL_PUBLISH_ENABLED',
  MEDIA_UPLOAD: 'PUBLISHER_MEDIA_UPLOAD_ENABLED',
  SCHEDULING: 'PUBLISHER_SCHEDULING_ENABLED',
  AD_INVENTORY: 'PUBLISHER_AD_INVENTORY_ENABLED',
  AD_PUBLIC_LISTING: 'PUBLISHER_AD_PUBLIC_LISTING_ENABLED',
  PROFILE_AD_SLOTS: 'PROFILE_AD_SLOTS_ENABLED',
  ARTICLE_AD_SLOTS: 'ARTICLE_AD_SLOTS_ENABLED',
  SELF_MANAGED_ADS: 'PUBLISHER_SELF_MANAGED_ADS_ENABLED',
  AD_SERVING: 'PUBLISHER_AD_SERVING_ENABLED',
  AD_ANALYTICS: 'PUBLISHER_AD_ANALYTICS_ENABLED',
  VIDEO_PREROLL: 'PUBLISHER_VIDEO_PREROLL_ENABLED',
  SOCIAL_GRAPH: 'SOCIAL_GRAPH_ENABLED',
  USER_PROFILES: 'USER_PROFILES_ENABLED',
  SMART_FEED: 'SMART_FEED_ENABLED',
  SMART_FEED_RANKING: 'SMART_FEED_RANKING_V1_ENABLED',
  COLD_START_V2: 'COLD_START_V2_ENABLED',
}

/**
 * Direct dependencies (must be effective before child).
 * Activation order: Platform→Studio→Composer→Content→Manual→Media→Social→Feed→
 * Inventory→SelfManaged→Serving→Analytics→Preroll
 */
export const FEATURE_DEPENDENCIES: Record<
  PublisherRolloutFeatureKey,
  readonly PublisherRolloutFeatureKey[]
> = {
  PLATFORM: [],
  STUDIO: ['PLATFORM'],
  PROFILE_COMPOSER: ['STUDIO'],
  CONTENT_STUDIO: ['STUDIO'],
  MANUAL_PUBLISH: ['CONTENT_STUDIO'],
  MEDIA_UPLOAD: ['CONTENT_STUDIO'],
  SCHEDULING: ['MANUAL_PUBLISH'],
  AD_INVENTORY: ['STUDIO'],
  AD_PUBLIC_LISTING: ['AD_INVENTORY'],
  PROFILE_AD_SLOTS: ['AD_INVENTORY'],
  ARTICLE_AD_SLOTS: ['AD_INVENTORY'],
  SELF_MANAGED_ADS: ['AD_INVENTORY'],
  AD_SERVING: ['SELF_MANAGED_ADS'],
  AD_ANALYTICS: ['AD_SERVING'],
  VIDEO_PREROLL: ['AD_SERVING'],
  SOCIAL_GRAPH: ['PLATFORM'],
  USER_PROFILES: ['PLATFORM'],
  SMART_FEED: ['SOCIAL_GRAPH'],
  SMART_FEED_RANKING: ['SMART_FEED'],
  COLD_START_V2: ['SMART_FEED'],
}

/** Features that may be granted via per-publisher allowlist without global ON. */
export const ALLOWLISTABLE_FEATURES: readonly PublisherRolloutFeatureKey[] = [
  'PLATFORM',
  'STUDIO',
  'PROFILE_COMPOSER',
  'CONTENT_STUDIO',
  'MANUAL_PUBLISH',
  'MEDIA_UPLOAD',
  'SCHEDULING',
  'AD_INVENTORY',
  'AD_PUBLIC_LISTING',
  'PROFILE_AD_SLOTS',
  'ARTICLE_AD_SLOTS',
  'SELF_MANAGED_ADS',
  'AD_SERVING',
  'AD_ANALYTICS',
  'VIDEO_PREROLL',
] as const

/** Consumer/social/feed: stage 4 — not mass-enabled via publisher allowlist. */
export const CONSUMER_STAGE_FEATURES: readonly PublisherRolloutFeatureKey[] = [
  'SOCIAL_GRAPH',
  'USER_PROFILES',
  'SMART_FEED',
  'SMART_FEED_RANKING',
  'COLD_START_V2',
] as const

export const ROLLOUT_STAGES: Record<
  PublisherRolloutStage,
  {
    name: string
    description: string
    features: readonly PublisherRolloutFeatureKey[]
  }
> = {
  0: {
    name: 'dark',
    description: 'All publisher/social/feed/ad flags OFF globally; tooling only.',
    features: [],
  },
  1: {
    name: 'internal',
    description: 'Internal/admin smoke with allowlist + CMS session; no public serving.',
    features: ['PLATFORM', 'STUDIO', 'PROFILE_COMPOSER', 'CONTENT_STUDIO', 'MANUAL_PUBLISH'],
  },
  2: {
    name: 'selected_verified',
    description: '1–3 admin-selected VERIFIED publishers; Studio/Content/Ads allowlist.',
    features: [
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
      'VIDEO_PREROLL',
      'PROFILE_AD_SLOTS',
      'ARTICLE_AD_SLOTS',
    ],
  },
  3: {
    name: 'onboarding_open',
    description: 'Claim + Studio onboarding open for verified journey; still no mass flags.',
    features: [
      'PLATFORM',
      'STUDIO',
      'PROFILE_COMPOSER',
      'CONTENT_STUDIO',
      'MANUAL_PUBLISH',
      'MEDIA_UPLOAD',
    ],
  },
  4: {
    name: 'consumer_feed_social',
    description: 'Smart Feed / social for staging or narrow cohort — never replace main feed.',
    features: ['SOCIAL_GRAPH', 'USER_PROFILES', 'SMART_FEED', 'SMART_FEED_RANKING', 'COLD_START_V2'],
  },
  5: {
    name: 'self_managed_ads_public',
    description: 'Public serving of self-managed ads for allowlisted verified publishers.',
    features: [
      'AD_INVENTORY',
      'SELF_MANAGED_ADS',
      'AD_SERVING',
      'AD_ANALYTICS',
      'VIDEO_PREROLL',
      'PROFILE_AD_SLOTS',
      'ARTICLE_AD_SLOTS',
    ],
  },
}

export function readGlobalFlag(envKey: string): boolean {
  const v = process.env[envKey]?.trim().toLowerCase()
  if (v === '1' || v === 'true' || v === 'yes') return true
  if (v === '0' || v === 'false' || v === 'no') return false
  // Prod-safe defaults: unset → false in production, true elsewhere (matches prior phases)
  if (
    envKey === 'SMART_FEED_TELEMETRY_ENABLED' ||
    envKey === 'SMART_FEED_RANKING_V1_ENABLED' ||
    envKey === 'COLD_START_V2_ENABLED' ||
    envKey === 'SEO_DISTRIBUTION_V1_ENABLED' ||
    envKey === 'EVENT_PAGES_ENABLED'
  ) {
    return false
  }
  return process.env.NODE_ENV !== 'production'
}

export function isGlobalFeatureEnabled(feature: PublisherRolloutFeatureKey): boolean {
  return readGlobalFlag(FEATURE_ENV_KEYS[feature])
}

/** Transitive dependency closure (parents first). */
export function dependencyClosure(
  feature: PublisherRolloutFeatureKey
): PublisherRolloutFeatureKey[] {
  const out: PublisherRolloutFeatureKey[] = []
  const seen = new Set<PublisherRolloutFeatureKey>()
  const walk = (f: PublisherRolloutFeatureKey) => {
    for (const dep of FEATURE_DEPENDENCIES[f]) {
      if (seen.has(dep)) continue
      seen.add(dep)
      walk(dep)
      out.push(dep)
    }
  }
  walk(feature)
  return out
}

/**
 * Resolve whether a feature is effective for a publisher.
 * Global ON wins; else allowlist entry; else OFF.
 * Dependencies must also be effective (global or allowlist) or we block.
 */
export function resolveFeatureForPublisher(input: {
  featureKey: PublisherRolloutFeatureKey
  allowlistedKeys: ReadonlySet<string>
}): {
  enabled: boolean
  source: 'global' | 'allowlist' | 'dependency_blocked' | 'off'
  missingDependencies: PublisherRolloutFeatureKey[]
} {
  const { featureKey, allowlistedKeys } = input
  const deps = dependencyClosure(featureKey)
  const missing: PublisherRolloutFeatureKey[] = []

  for (const dep of deps) {
    const depOk =
      isGlobalFeatureEnabled(dep) ||
      (ALLOWLISTABLE_FEATURES.includes(dep) && allowlistedKeys.has(dep))
    if (!depOk) missing.push(dep)
  }

  if (missing.length > 0) {
    return { enabled: false, source: 'dependency_blocked', missingDependencies: missing }
  }

  if (isGlobalFeatureEnabled(featureKey)) {
    return { enabled: true, source: 'global', missingDependencies: [] }
  }

  if (ALLOWLISTABLE_FEATURES.includes(featureKey) && allowlistedKeys.has(featureKey)) {
    return { enabled: true, source: 'allowlist', missingDependencies: [] }
  }

  return { enabled: false, source: 'off', missingDependencies: [] }
}

/** Validate an allowlist grant: reject unknown keys, consumer-only keys, broken deps. */
export function validateAllowlistGrant(input: {
  featureKey: string
  allowlistedKeys: ReadonlySet<string>
}): { ok: true; featureKey: PublisherRolloutFeatureKey } | { ok: false; reason: string } {
  const key = input.featureKey as PublisherRolloutFeatureKey
  if (!Object.prototype.hasOwnProperty.call(FEATURE_ENV_KEYS, key)) {
    return { ok: false, reason: 'UNKNOWN_FEATURE' }
  }
  if (!ALLOWLISTABLE_FEATURES.includes(key)) {
    return { ok: false, reason: 'NOT_ALLOWLISTABLE' }
  }
  const simulated = new Set(input.allowlistedKeys)
  simulated.add(key)
  const resolved = resolveFeatureForPublisher({
    featureKey: key,
    allowlistedKeys: simulated,
  })
  if (resolved.source === 'dependency_blocked') {
    return {
      ok: false,
      reason: `MISSING_DEPS:${resolved.missingDependencies.join(',')}`,
    }
  }
  return { ok: true, featureKey: key }
}

export function getOperatorChecklist(stage: PublisherRolloutStage): string[] {
  const base = [
    'Confirm global production flags remain false unless explicitly opening a stage.',
    'Use CMS/admin session only — no auth bypass.',
    'Select 1–3 VERIFIED publishers max for pilot (stage 2+).',
    'Prefer allowlist grants over global ON.',
    'Feature rollback = disable allowlist row or flag OFF; never delete publisher/content/ad records.',
    'After any ad smoke: confirm payment_intents / payment_transactions / commercial_ledger_entries / publisher_earnings unchanged.',
  ]
  switch (stage) {
    case 0:
      return [...base, 'Deploy tooling only; no cohort grants.']
    case 1:
      return [
        ...base,
        'Grant PLATFORM+STUDIO(+content) allowlist to internal test publisher.',
        'Run bootstrap dry-run for 5 sources; review CREATE/LINK/SKIP/AMBIGUOUS/ERROR.',
      ]
    case 2:
      return [
        ...base,
        'Admin-select 1–3 verified publishers.',
        'Grant stage-2 allowlist bundle; verify claim→studio handoff.',
        'Smoke: manual publish, layout, inventory, managed ad, analytics; financial isolation.',
      ]
    case 3:
      return [
        ...base,
        'Open claim CTA + onboarding checklist for selected cohort only.',
        'Do not mass-email or auto-outreach.',
      ]
    case 4:
      return [
        ...base,
        'Enable Smart Feed / social only in staging or narrow cohort — not main feed replacement.',
        'No fake engagement; ranking smoke personas only in non-prod.',
      ]
    case 5:
      return [
        ...base,
        'Enable AD_SERVING (+ preroll/analytics) for allowlisted verified only.',
        'Confirm P10A payment flags remain false.',
      ]
    default:
      return base
  }
}
