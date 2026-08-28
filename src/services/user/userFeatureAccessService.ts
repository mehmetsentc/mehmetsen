import {
  USER_ALLOWLISTABLE_FEATURES,
  USER_FEATURE_ENV_KEYS,
  isGlobalUserFeatureEnabled,
  resolveFeatureForUser,
  validateUserAllowlistGrant,
} from '@/lib/user/userRolloutMatrix'
import type { UserRolloutFeatureKey, UserFeatureResolution } from '@/types/userRollout'
import {
  UserFeatureAccessRepository,
  userFeatureAccessRepository,
} from './userFeatureAccessRepository'

export class UserFeatureAccessService {
  constructor(
    private readonly accessRepo: UserFeatureAccessRepository = userFeatureAccessRepository
  ) {}

  async getEnabledKeys(userId: string): Promise<Set<string>> {
    if (!userId) return new Set()
    return this.accessRepo.listEnabledKeys(userId)
  }

  async listRows(userId: string) {
    if (!userId) return []
    return this.accessRepo.listForUser(userId)
  }

  async isEnabledForUser(
    userId: string | null | undefined,
    featureKey: UserRolloutFeatureKey
  ): Promise<boolean> {
    if (!userId) {
      return resolveFeatureForUser({ featureKey, allowlistedKeys: new Set() }).enabled
    }
    const keys = await this.accessRepo.listEnabledKeys(userId)
    return resolveFeatureForUser({ featureKey, allowlistedKeys: keys }).enabled
  }

  async resolveAll(userId: string | null | undefined): Promise<Record<string, UserFeatureResolution>> {
    const keys = userId ? await this.accessRepo.listEnabledKeys(userId) : new Set<string>()
    const out: Record<string, UserFeatureResolution> = {}
    for (const featureKey of Object.keys(USER_FEATURE_ENV_KEYS) as UserRolloutFeatureKey[]) {
      out[featureKey] = resolveFeatureForUser({ featureKey, allowlistedKeys: keys })
    }
    return out
  }

  async setFeatureAccess(input: {
    userId: string
    featureKey: string
    enabled: boolean
    actorId: string
    reason?: string | null
  }) {
    const currentKeys = await this.accessRepo.listEnabledKeys(input.userId)

    if (input.enabled) {
      const validation = validateUserAllowlistGrant({
        featureKey: input.featureKey,
        allowlistedKeys: currentKeys,
      })
      if (!validation.ok) throw new Error(validation.reason)

      return await this.accessRepo.upsert({
        userId: input.userId,
        featureKey: validation.featureKey,
        enabled: true,
        actorId: input.actorId,
        reason: input.reason,
      })
    }

    if (!USER_ALLOWLISTABLE_FEATURES.includes(input.featureKey as UserRolloutFeatureKey)) {
      throw new Error('NOT_ALLOWLISTABLE')
    }
    const featureKey = input.featureKey as UserRolloutFeatureKey
    return await this.accessRepo.upsert({
      userId: input.userId,
      featureKey,
      enabled: false,
      actorId: input.actorId,
      reason: input.reason,
    })
  }

  /** Grant complete stage-4 consumer pilot bundle to an internal pilot user. */
  async grantPilotBundle(input: {
    userId: string
    actorId: string
    reason?: string | null
  }) {
    const bundle: UserRolloutFeatureKey[] = [
      'USER_PROFILES',
      'SOCIAL_GRAPH',
      'SMART_FEED',
      'SMART_FEED_RANKING_V1',
      'COLD_START_V2',
      'SMART_FEED_VIDEO',
      'SMART_FEED_TELEMETRY',
    ]
    const results = []
    for (const featureKey of bundle) {
      results.push(
        await this.setFeatureAccess({
          userId: input.userId,
          featureKey,
          enabled: true,
          actorId: input.actorId,
          reason: input.reason ?? 'P14 consumer pilot bundle',
        })
      )
    }
    return results
  }

  /** Revoke all pilot grants for a user (pilot kill switch). */
  async revokePilotBundle(input: {
    userId: string
    actorId: string
  }) {
    return await this.accessRepo.revokeAllForUser(input.userId, input.actorId)
  }

  async rolloutVisibility() {
    const counts = await this.accessRepo.countEnabledByFeature()
    const globals: Record<string, boolean> = {}
    for (const featureKey of Object.keys(USER_FEATURE_ENV_KEYS) as UserRolloutFeatureKey[]) {
      globals[featureKey] = isGlobalUserFeatureEnabled(featureKey)
    }
    return { globals, allowlistCounts: counts }
  }
}

export const userFeatureAccessService = new UserFeatureAccessService()
