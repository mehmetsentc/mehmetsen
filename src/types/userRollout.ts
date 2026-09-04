/** Phase P14 — Consumer rollout feature access types (controlled pilot). */

export const USER_ROLLOUT_FEATURE_KEYS = [
  'USER_PROFILES',
  'SOCIAL_GRAPH',
  'SMART_FEED',
  'SMART_FEED_RANKING_V1',
  'COLD_START_V2',
  'SMART_FEED_VIDEO',
  'SMART_FEED_TELEMETRY',
  'NFRANK_V1',
] as const

export type UserRolloutFeatureKey = (typeof USER_ROLLOUT_FEATURE_KEYS)[number]

export interface UserFeatureAccessRecord {
  id: string
  userId: string
  featureKey: UserRolloutFeatureKey
  enabled: boolean
  createdAt: Date
  createdBy: string
  updatedAt: Date
  updatedBy: string | null
  reason: string | null
}

export interface UserFeatureResolution {
  featureKey: UserRolloutFeatureKey
  enabled: boolean
  source: 'global' | 'allowlist' | 'dependency_blocked' | 'off'
  missingDependencies: UserRolloutFeatureKey[]
}
