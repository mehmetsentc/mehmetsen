import { publisherLog } from '@/lib/publisher/observability'
import {
  ALLOWLISTABLE_FEATURES,
  FEATURE_ENV_KEYS,
  isGlobalFeatureEnabled,
  resolveFeatureForPublisher,
  validateAllowlistGrant,
} from '@/lib/publisher/rolloutMatrix'
import type { PublisherRolloutFeatureKey } from '@/types/publisherRollout'
import {
  PublisherFeatureAccessRepository,
  publisherFeatureAccessRepository,
} from './publisherFeatureAccessRepository'
import { PublisherRepository, publisherRepository } from './publisherRepository'

export class PublisherFeatureAccessService {
  constructor(
    private readonly accessRepo: PublisherFeatureAccessRepository = publisherFeatureAccessRepository,
    private readonly publisherRepo: PublisherRepository = publisherRepository
  ) {}

  async getEnabledKeys(publisherId: string): Promise<Set<string>> {
    return this.accessRepo.listEnabledKeys(publisherId)
  }

  async listRows(publisherId: string) {
    return this.accessRepo.listForPublisher(publisherId)
  }

  async isEnabledForPublisher(
    publisherId: string,
    featureKey: PublisherRolloutFeatureKey
  ): Promise<boolean> {
    const keys = await this.accessRepo.listEnabledKeys(publisherId)
    return resolveFeatureForPublisher({ featureKey, allowlistedKeys: keys }).enabled
  }

  async resolveAll(publisherId: string) {
    const keys = await this.accessRepo.listEnabledKeys(publisherId)
    const out: Record<
      string,
      ReturnType<typeof resolveFeatureForPublisher>
    > = {}
    for (const featureKey of Object.keys(FEATURE_ENV_KEYS) as PublisherRolloutFeatureKey[]) {
      out[featureKey] = resolveFeatureForPublisher({ featureKey, allowlistedKeys: keys })
    }
    return out
  }

  /**
   * CMS/admin only. Publishers cannot call this.
   * Verified requirement for ads-related grants.
   */
  async setFeatureAccess(input: {
    publisherId: string
    featureKey: string
    enabled: boolean
    actorId: string
    note?: string | null
  }) {
    const publisher = await this.publisherRepo.findById(input.publisherId)
    if (!publisher) throw new Error('PUBLISHER_NOT_FOUND')

    const currentKeys = await this.accessRepo.listEnabledKeys(input.publisherId)

    if (input.enabled) {
      const validation = validateAllowlistGrant({
        featureKey: input.featureKey,
        allowlistedKeys: currentKeys,
      })
      if (!validation.ok) throw new Error(validation.reason)

      const adsRelated: PublisherRolloutFeatureKey[] = [
        'AD_INVENTORY',
        'AD_PUBLIC_LISTING',
        'PROFILE_AD_SLOTS',
        'ARTICLE_AD_SLOTS',
        'SELF_MANAGED_ADS',
        'AD_SERVING',
        'AD_ANALYTICS',
        'VIDEO_PREROLL',
      ]
      if (
        adsRelated.includes(validation.featureKey) &&
        publisher.verificationStatus !== 'VERIFIED'
      ) {
        throw new Error('PUBLISHER_NOT_VERIFIED')
      }

      const record = await this.accessRepo.upsert({
        publisherId: input.publisherId,
        featureKey: validation.featureKey,
        enabled: true,
        actorId: input.actorId,
        note: input.note,
      })
      publisherLog('PUBLISHER_FEATURE_ENABLED', {
        publisherId: input.publisherId,
        featureKey: validation.featureKey,
        actorId: input.actorId,
      })
      return record
    }

    if (!ALLOWLISTABLE_FEATURES.includes(input.featureKey as PublisherRolloutFeatureKey)) {
      throw new Error('NOT_ALLOWLISTABLE')
    }
    const featureKey = input.featureKey as PublisherRolloutFeatureKey
    const record = await this.accessRepo.upsert({
      publisherId: input.publisherId,
      featureKey,
      enabled: false,
      actorId: input.actorId,
      note: input.note,
    })
    publisherLog('PUBLISHER_FEATURE_DISABLED', {
      publisherId: input.publisherId,
      featureKey,
      actorId: input.actorId,
    })
    return record
  }

  /** Grant a stage-2 pilot bundle for a verified publisher (idempotent). */
  async grantPilotBundle(input: {
    publisherId: string
    actorId: string
    note?: string | null
  }) {
    const bundle: PublisherRolloutFeatureKey[] = [
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
    ]
    const results = []
    for (const featureKey of bundle) {
      results.push(
        await this.setFeatureAccess({
          publisherId: input.publisherId,
          featureKey,
          enabled: true,
          actorId: input.actorId,
          note: input.note ?? 'P11 pilot bundle',
        })
      )
    }
    return results
  }

  async rolloutVisibility() {
    const counts = await this.accessRepo.countEnabledByFeature()
    const globals: Record<string, boolean> = {}
    for (const featureKey of Object.keys(FEATURE_ENV_KEYS) as PublisherRolloutFeatureKey[]) {
      globals[featureKey] = isGlobalFeatureEnabled(featureKey)
    }
    return { globals, allowlistCounts: counts }
  }
}

export const publisherFeatureAccessService = new PublisherFeatureAccessService()
