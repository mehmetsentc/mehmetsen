/** Phase P11 — publisher platform rollout types (allowlist + stages). */

export const PUBLISHER_ROLLOUT_FEATURE_KEYS = [
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
  'SOCIAL_GRAPH',
  'USER_PROFILES',
  'SMART_FEED',
  'SMART_FEED_RANKING',
  'COLD_START_V2',
] as const

export type PublisherRolloutFeatureKey = (typeof PUBLISHER_ROLLOUT_FEATURE_KEYS)[number]

export type PublisherRolloutStage = 0 | 1 | 2 | 3 | 4 | 5

export interface PublisherFeatureAccessRecord {
  id: string
  publisherId: string
  featureKey: PublisherRolloutFeatureKey
  enabled: boolean
  createdAt: Date
  createdBy: string
  updatedAt: Date
  updatedBy: string | null
  note: string | null
}

export interface FeatureResolution {
  featureKey: PublisherRolloutFeatureKey
  enabled: boolean
  source: 'global' | 'allowlist' | 'dependency_blocked' | 'off'
  missingDependencies: PublisherRolloutFeatureKey[]
}

export interface PublisherSetupStatus {
  profileComplete: boolean
  hasLogoOrCover: boolean
  hasPublishedNews: boolean
  hasTeam: boolean
  hasAdInventory: boolean
  checklistDismissed: boolean
}
