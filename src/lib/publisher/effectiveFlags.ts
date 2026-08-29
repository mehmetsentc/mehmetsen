/**
 * Effective publisher feature flags — global OR allowlist (P11).
 * Prefer these over raw isXEnabled() whenever publisherId is known.
 */
import {
  isPublisherAdInventoryEnabled,
  isArticleAdSlotsEnabled,
  isProfileAdSlotsEnabled,
  isPublisherAdPublicListingEnabled,
} from '@/lib/publisher/adInventoryFlags'
import {
  isPublisherContentStudioEnabled,
  isPublisherManualPublishEnabled,
  isPublisherMediaUploadEnabled,
  isPublisherSchedulingEnabled,
} from '@/lib/publisher/contentFlags'
import {
  isPublisherPlatformEnabled,
  isPublisherProfileComposerEnabled,
  isPublisherStudioEnabled,
} from '@/lib/publisher/featureFlag'
import {
  isPublisherAdAnalyticsEnabled,
  isPublisherAdServingEnabled,
  isPublisherSelfManagedAdsEnabled,
  isPublisherVideoPrerollEnabled,
} from '@/lib/publisher/selfManagedAdFlags'
import { resolveFeatureForPublisher } from '@/lib/publisher/rolloutMatrix'
import type { PublisherRolloutFeatureKey } from '@/types/publisherRollout'
import { publisherFeatureAccessService } from '@/services/publisher/publisherFeatureAccessService'

const GLOBAL_CHECKERS: Record<PublisherRolloutFeatureKey, () => boolean> = {
  PLATFORM: isPublisherPlatformEnabled,
  STUDIO: isPublisherStudioEnabled,
  PROFILE_COMPOSER: isPublisherProfileComposerEnabled,
  CONTENT_STUDIO: isPublisherContentStudioEnabled,
  MANUAL_PUBLISH: isPublisherManualPublishEnabled,
  MEDIA_UPLOAD: isPublisherMediaUploadEnabled,
  SCHEDULING: isPublisherSchedulingEnabled,
  AD_INVENTORY: isPublisherAdInventoryEnabled,
  AD_PUBLIC_LISTING: isPublisherAdPublicListingEnabled,
  PROFILE_AD_SLOTS: isProfileAdSlotsEnabled,
  ARTICLE_AD_SLOTS: isArticleAdSlotsEnabled,
  SELF_MANAGED_ADS: isPublisherSelfManagedAdsEnabled,
  AD_SERVING: isPublisherAdServingEnabled,
  AD_ANALYTICS: isPublisherAdAnalyticsEnabled,
  VIDEO_PREROLL: isPublisherVideoPrerollEnabled,
  SOCIAL_GRAPH: () => {
    const v = process.env.SOCIAL_GRAPH_ENABLED?.trim().toLowerCase()
    if (v === '1' || v === 'true' || v === 'yes') return true
    if (v === '0' || v === 'false' || v === 'no') return false
    return true
  },
  USER_PROFILES: () => {
    const v = process.env.USER_PROFILES_ENABLED?.trim().toLowerCase()
    if (v === '1' || v === 'true' || v === 'yes') return true
    if (v === '0' || v === 'false' || v === 'no') return false
    return true
  },
  SMART_FEED: () => {
    const v = process.env.SMART_FEED_ENABLED?.trim().toLowerCase()
    if (v === '1' || v === 'true' || v === 'yes') return true
    if (v === '0' || v === 'false' || v === 'no') return false
    return true
  },
  SMART_FEED_RANKING: () => {
    const v = process.env.SMART_FEED_RANKING_V1_ENABLED?.trim().toLowerCase()
    if (v === '1' || v === 'true' || v === 'yes') return true
    if (v === '0' || v === 'false' || v === 'no') return false
    return true
  },
  COLD_START_V2: () => {
    const v = process.env.COLD_START_V2_ENABLED?.trim().toLowerCase()
    if (v === '1' || v === 'true' || v === 'yes') return true
    if (v === '0' || v === 'false' || v === 'no') return false
    return true
  },
}

/** Fast path when no publisher context — global only. */
export function isFeatureGloballyEnabled(feature: PublisherRolloutFeatureKey): boolean {
  return GLOBAL_CHECKERS[feature]()
}

export async function isFeatureEnabledForPublisher(
  publisherId: string,
  feature: PublisherRolloutFeatureKey
): Promise<boolean> {
  // Global-only path: no DB. Unit tests / full global ON avoid allowlist lookup.
  const globalOnly = resolveFeatureForPublisher({
    featureKey: feature,
    allowlistedKeys: new Set(),
  })
  if (globalOnly.enabled) return true

  // Mixed / allowlist path — requires DB
  try {
    return await publisherFeatureAccessService.isEnabledForPublisher(publisherId, feature)
  } catch {
    return false
  }
}

/** Studio gate: global STUDIO OR allowlist STUDIO (with PLATFORM dep). */
export async function isStudioEffectiveForPublisher(publisherId: string): Promise<boolean> {
  return isFeatureEnabledForPublisher(publisherId, 'STUDIO')
}

export async function isPlatformEffectiveForPublisher(publisherId: string): Promise<boolean> {
  return isFeatureEnabledForPublisher(publisherId, 'PLATFORM')
}

export async function isContentStudioEffectiveForPublisher(publisherId: string): Promise<boolean> {
  return isFeatureEnabledForPublisher(publisherId, 'CONTENT_STUDIO')
}

export async function isAdInventoryEffectiveForPublisher(publisherId: string): Promise<boolean> {
  return isFeatureEnabledForPublisher(publisherId, 'AD_INVENTORY')
}

export async function isSelfManagedAdsEffectiveForPublisher(publisherId: string): Promise<boolean> {
  return isFeatureEnabledForPublisher(publisherId, 'SELF_MANAGED_ADS')
}

export async function isAdServingEffectiveForPublisher(publisherId: string): Promise<boolean> {
  return isFeatureEnabledForPublisher(publisherId, 'AD_SERVING')
}
