/**
 * Effective consumer/user feature flags — global OR user allowlist (P14).
 * Prefer these over raw global isXEnabled() whenever userId is known.
 */
import { resolveFeatureForUser } from '@/lib/user/userRolloutMatrix'
import type { UserRolloutFeatureKey } from '@/types/userRollout'
import { userFeatureAccessService } from '@/services/user/userFeatureAccessService'

export async function isFeatureEnabledForUser(
  userId: string | null | undefined,
  feature: UserRolloutFeatureKey
): Promise<boolean> {
  // Global check fast-path: if global flag is ON, no DB lookup needed
  const globalOnly = resolveFeatureForUser({
    featureKey: feature,
    allowlistedKeys: new Set(),
  })
  if (globalOnly.enabled) return true

  if (!userId) return false

  try {
    return await userFeatureAccessService.isEnabledForUser(userId, feature)
  } catch {
    return false
  }
}

export async function isSmartFeedEffectiveForUser(userId: string | null | undefined): Promise<boolean> {
  return isFeatureEnabledForUser(userId, 'SMART_FEED')
}

export async function isSmartFeedRankingEffectiveForUser(userId: string | null | undefined): Promise<boolean> {
  return isFeatureEnabledForUser(userId, 'SMART_FEED_RANKING_V1')
}

export async function isSocialGraphEffectiveForUser(userId: string | null | undefined): Promise<boolean> {
  return isFeatureEnabledForUser(userId, 'SOCIAL_GRAPH')
}

export async function isUserProfilesEffectiveForUser(userId: string | null | undefined): Promise<boolean> {
  return isFeatureEnabledForUser(userId, 'USER_PROFILES')
}

export async function isColdStartEffectiveForUser(userId: string | null | undefined): Promise<boolean> {
  return isFeatureEnabledForUser(userId, 'COLD_START_V2')
}

export async function isSmartFeedVideoEffectiveForUser(userId: string | null | undefined): Promise<boolean> {
  return isFeatureEnabledForUser(userId, 'SMART_FEED_VIDEO')
}

export async function isSmartFeedTelemetryEffectiveForUser(userId: string | null | undefined): Promise<boolean> {
  return isFeatureEnabledForUser(userId, 'SMART_FEED_TELEMETRY')
}

/** NFRank live — Feed V2 only; requires NFRANK_V1 grant/global (default off). */
export async function isNfRankLiveEffectiveForUser(userId: string | null | undefined): Promise<boolean> {
  return isFeatureEnabledForUser(userId, 'NFRANK_V1')
}
