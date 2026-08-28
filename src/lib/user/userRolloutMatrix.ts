/**
 * Phase P14 — central user rollout matrix + feature dependency graph for consumer pilot.
 * Safely resolves user-level feature flags with transitive dependency enforcement.
 */
import type {
  UserRolloutFeatureKey,
  UserFeatureResolution,
} from '@/types/userRollout'
import {
  isSmartFeedEnabled,
  isSmartFeedRankingV1Enabled,
  isSmartFeedVideoEnabled,
  isSmartFeedTelemetryEnabled,
  isColdStartV2Enabled,
} from '@/lib/feed/featureFlag'
import {
  isSocialGraphEnabled,
  isUserProfilesEnabled,
} from '@/lib/social/featureFlag'

export const USER_FEATURE_ENV_KEYS: Record<UserRolloutFeatureKey, string> = {
  USER_PROFILES: 'USER_PROFILES_ENABLED',
  SOCIAL_GRAPH: 'SOCIAL_GRAPH_ENABLED',
  SMART_FEED: 'SMART_FEED_ENABLED',
  SMART_FEED_RANKING_V1: 'SMART_FEED_RANKING_V1_ENABLED',
  COLD_START_V2: 'COLD_START_V2_ENABLED',
  SMART_FEED_VIDEO: 'SMART_FEED_VIDEO_ENABLED',
  SMART_FEED_TELEMETRY: 'SMART_FEED_TELEMETRY_ENABLED',
}

export const USER_FEATURE_DEPENDENCIES: Record<
  UserRolloutFeatureKey,
  readonly UserRolloutFeatureKey[]
> = {
  USER_PROFILES: [],
  SOCIAL_GRAPH: [],
  SMART_FEED: ['SOCIAL_GRAPH'],
  SMART_FEED_RANKING_V1: ['SMART_FEED'],
  COLD_START_V2: ['SMART_FEED'],
  SMART_FEED_VIDEO: ['SMART_FEED'],
  SMART_FEED_TELEMETRY: ['SMART_FEED'],
}

export const USER_ALLOWLISTABLE_FEATURES: readonly UserRolloutFeatureKey[] = [
  'USER_PROFILES',
  'SOCIAL_GRAPH',
  'SMART_FEED',
  'SMART_FEED_RANKING_V1',
  'COLD_START_V2',
  'SMART_FEED_VIDEO',
  'SMART_FEED_TELEMETRY',
] as const

const GLOBAL_CHECKERS: Record<UserRolloutFeatureKey, () => boolean> = {
  USER_PROFILES: isUserProfilesEnabled,
  SOCIAL_GRAPH: isSocialGraphEnabled,
  SMART_FEED: isSmartFeedEnabled,
  SMART_FEED_RANKING_V1: isSmartFeedRankingV1Enabled,
  COLD_START_V2: isColdStartV2Enabled,
  SMART_FEED_VIDEO: isSmartFeedVideoEnabled,
  SMART_FEED_TELEMETRY: isSmartFeedTelemetryEnabled,
}

export function isGlobalUserFeatureEnabled(feature: UserRolloutFeatureKey): boolean {
  return GLOBAL_CHECKERS[feature]()
}

/** Transitive dependency closure (parents first). */
export function userDependencyClosure(
  feature: UserRolloutFeatureKey
): UserRolloutFeatureKey[] {
  const out: UserRolloutFeatureKey[] = []
  const seen = new Set<UserRolloutFeatureKey>()
  const walk = (f: UserRolloutFeatureKey) => {
    for (const dep of USER_FEATURE_DEPENDENCIES[f]) {
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
 * Resolve whether a feature is effective for a user.
 * Resolution logic:
 * 1. Dependencies must be met (either globally or in user allowlist).
 * 2. If global is ON -> enabled (global).
 * 3. If user grant is in allowlist -> enabled (allowlist).
 * 4. Else -> disabled (off).
 */
export function resolveFeatureForUser(input: {
  featureKey: UserRolloutFeatureKey
  allowlistedKeys: ReadonlySet<string>
}): UserFeatureResolution {
  const { featureKey, allowlistedKeys } = input

  const hasGlobal = isGlobalUserFeatureEnabled(featureKey)
  const hasAllowlist = USER_ALLOWLISTABLE_FEATURES.includes(featureKey) && allowlistedKeys.has(featureKey)

  if (!hasGlobal && !hasAllowlist) {
    return { featureKey, enabled: false, source: 'off', missingDependencies: [] }
  }

  const deps = userDependencyClosure(featureKey)
  const missing: UserRolloutFeatureKey[] = []

  for (const dep of deps) {
    const depOk =
      isGlobalUserFeatureEnabled(dep) ||
      (USER_ALLOWLISTABLE_FEATURES.includes(dep) && allowlistedKeys.has(dep))
    if (!depOk) missing.push(dep)
  }

  if (missing.length > 0) {
    return { featureKey, enabled: false, source: 'dependency_blocked', missingDependencies: missing }
  }

  if (hasGlobal) {
    return { featureKey, enabled: true, source: 'global', missingDependencies: [] }
  }

  return { featureKey, enabled: true, source: 'allowlist', missingDependencies: [] }
}

/** Validate an allowlist grant for user: reject unknown keys or broken deps. */
export function validateUserAllowlistGrant(input: {
  featureKey: string
  allowlistedKeys: ReadonlySet<string>
}): { ok: true; featureKey: UserRolloutFeatureKey } | { ok: false; reason: string } {
  const key = input.featureKey as UserRolloutFeatureKey
  if (!Object.prototype.hasOwnProperty.call(USER_FEATURE_ENV_KEYS, key)) {
    return { ok: false, reason: 'UNKNOWN_FEATURE' }
  }
  if (!USER_ALLOWLISTABLE_FEATURES.includes(key)) {
    return { ok: false, reason: 'NOT_ALLOWLISTABLE' }
  }
  const simulated = new Set(input.allowlistedKeys)
  simulated.add(key)
  const resolved = resolveFeatureForUser({
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
