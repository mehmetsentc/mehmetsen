import { MarketplaceValidationError } from '@/lib/advertiser/marketplaceDomain'
import { newPublisherId } from '@/lib/publisher/id'
import { publisherLog } from '@/lib/publisher/observability'
import {
  isAdEligibleNow,
  SelfManagedAdValidationError,
  statusesConflictOnSchedule,
  validateCreateAdInput,
  validateCreativeInput,
  validateUpdateAdInput,
} from '@/lib/publisher/selfManagedAdDomain'
import {
  isPublisherAdAnalyticsEnabled,
  isPublisherAdServingEnabled,
  isPublisherSelfManagedAdsEnabled,
} from '@/lib/publisher/selfManagedAdFlags'
import type {
  PublisherAdCreativeCreateInput,
  PublisherAdCreativeRecord,
  PublisherAdAnalyticsSummary,
  PublisherManagedAdCreateInput,
  PublisherManagedAdRecord,
  PublisherManagedAdStatus,
  PublisherManagedAdUpdateInput,
  ResolvedPublisherAd,
} from '@/types/publisherManagedAds'
import type { PublisherRecord } from '@/types/publisher'
import { requirePublisherMember } from './publisherLayoutService'
import {
  PublisherManagedAdsRepository,
  publisherManagedAdsRepository,
} from './publisherManagedAdsRepository'
import {
  PublisherAdInventoryRepository,
  publisherAdInventoryRepository,
} from './publisherAdInventoryRepository'
import { PublisherRepository, publisherRepository } from './publisherRepository'

export class PublisherManagedAdsError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'DISABLED'
      | 'FLAG_OFF'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'VALIDATION'
      | 'UNVERIFIED'
      | 'UNCLAIMED'
      | 'SUSPENDED'
      | 'CONFLICT'
      | 'INVALID_STATE' = 'VALIDATION'
  ) {
    super(message)
    this.name = 'PublisherManagedAdsError'
  }
}

function assertCanMutatePublisher(publisher: PublisherRecord): void {
  if (publisher.verificationStatus === 'UNCLAIMED' || publisher.status === 'UNCLAIMED') {
    throw new PublisherManagedAdsError('UNCLAIMED', 'UNCLAIMED')
  }
  if (publisher.verificationStatus !== 'VERIFIED') {
    throw new PublisherManagedAdsError('VERIFIED_REQUIRED', 'UNVERIFIED')
  }
  if (publisher.status === 'SUSPENDED') {
    throw new PublisherManagedAdsError('PUBLISHER_SUSPENDED', 'SUSPENDED')
  }
}

function wrapValidation(err: unknown): never {
  if (err instanceof SelfManagedAdValidationError) {
    throw new PublisherManagedAdsError(err.message, 'VALIDATION')
  }
  if (err instanceof MarketplaceValidationError) {
    throw new PublisherManagedAdsError(err.message, 'VALIDATION')
  }
  throw err
}

/** Synthetic / bot traffic must not create real impressions. */
export function isSyntheticAdActor(opts: {
  userId?: string | null
  sessionId?: string | null
}): boolean {
  const sid = opts.sessionId?.trim().toLowerCase() || ''
  const uid = opts.userId?.trim().toLowerCase() || ''
  if (sid.startsWith('synthetic') || sid.includes('synthetic-')) return true
  if (uid.startsWith('synthetic') || uid.startsWith('ai_editor_')) return true
  return false
}

export class PublisherManagedAdsService {
  constructor(
    private readonly repo: PublisherManagedAdsRepository = publisherManagedAdsRepository,
    private readonly inventoryRepo: PublisherAdInventoryRepository = publisherAdInventoryRepository,
    private readonly publisherRepo: PublisherRepository = publisherRepository
  ) {}

  private assertEnabled() {
    if (!isPublisherSelfManagedAdsEnabled()) {
      throw new PublisherManagedAdsError('SELF_MANAGED_ADS_DISABLED', 'FLAG_OFF')
    }
  }

  private async assertInventoryOwned(
    publisherId: string,
    inventoryId: string
  ): Promise<void> {
    const inv = await this.inventoryRepo.findById(inventoryId)
    if (!inv || inv.publisherId !== publisherId) {
      throw new PublisherManagedAdsError('INVENTORY_NOT_FOUND', 'NOT_FOUND')
    }
    if (inv.status === 'ARCHIVED') {
      throw new PublisherManagedAdsError('INVENTORY_ARCHIVED', 'VALIDATION')
    }
  }

  private async assertNoScheduleConflict(
    inventoryId: string,
    startAt: Date,
    endAt: Date,
    status: PublisherManagedAdStatus,
    excludeAdId?: string
  ): Promise<void> {
    if (!statusesConflictOnSchedule(status)) return
    const conflicts = await this.repo.listScheduleConflicts(inventoryId, startAt, endAt, excludeAdId)
    if (conflicts.length > 0) {
      throw new PublisherManagedAdsError('SCHEDULE_CONFLICT', 'CONFLICT')
    }
  }

  async list(
    publisherId: string,
    userId: string,
    opts?: { status?: PublisherManagedAdStatus | 'ALL'; includeArchived?: boolean }
  ): Promise<PublisherManagedAdRecord[]> {
    this.assertEnabled()
    await requirePublisherMember(publisherId, userId, 'ads:read', this.publisherRepo)
    return this.repo.listAds(publisherId, opts)
  }

  async get(
    publisherId: string,
    adId: string,
    userId: string
  ): Promise<PublisherManagedAdRecord & { creative: PublisherAdCreativeRecord | null }> {
    this.assertEnabled()
    await requirePublisherMember(publisherId, userId, 'ads:read', this.publisherRepo)
    const ad = await this.repo.findAd(adId)
    if (!ad || ad.publisherId !== publisherId) {
      throw new PublisherManagedAdsError('NOT_FOUND', 'NOT_FOUND')
    }
    const creative = await this.repo.currentCreative(adId)
    return { ...ad, creative }
  }

  async create(
    publisherId: string,
    userId: string,
    raw: PublisherManagedAdCreateInput
  ): Promise<PublisherManagedAdRecord> {
    this.assertEnabled()
    await requirePublisherMember(publisherId, userId, 'ads:create', this.publisherRepo)
    const publisher = await this.publisherRepo.findById(publisherId)
    if (!publisher) throw new PublisherManagedAdsError('PUBLISHER_NOT_FOUND', 'NOT_FOUND')
    assertCanMutatePublisher(publisher)

    let input: ReturnType<typeof validateCreateAdInput>
    try {
      input = validateCreateAdInput(raw)
    } catch (err) {
      wrapValidation(err)
    }

    await this.assertInventoryOwned(publisherId, input.inventoryId)
    await this.assertNoScheduleConflict(
      input.inventoryId,
      input.startAt,
      input.endAt,
      input.status
    )

    const now = new Date()
    const ad: PublisherManagedAdRecord = {
      id: newPublisherId('pmad'),
      publisherId,
      inventoryId: input.inventoryId,
      name: input.name,
      advertiserName: input.advertiserName,
      advertiserId: input.advertiserId,
      status: input.status,
      startAt: input.startAt,
      endAt: input.endAt,
      destinationUrl: input.destinationUrl,
      internalNote: input.internalNote,
      sourceType: 'SELF_MANAGED',
      createdBy: userId,
      updatedBy: null,
      archivedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    await this.repo.insertAd(ad)
    publisherLog('publisher_managed_ad_created', {
      publisherId,
      adId: ad.id,
      userId,
      inventoryId: ad.inventoryId,
    })
    return ad
  }

  async update(
    publisherId: string,
    adId: string,
    userId: string,
    raw: PublisherManagedAdUpdateInput
  ): Promise<PublisherManagedAdRecord> {
    this.assertEnabled()
    await requirePublisherMember(publisherId, userId, 'ads:update', this.publisherRepo)
    const publisher = await this.publisherRepo.findById(publisherId)
    if (!publisher) throw new PublisherManagedAdsError('PUBLISHER_NOT_FOUND', 'NOT_FOUND')
    assertCanMutatePublisher(publisher)

    const existing = await this.repo.findAd(adId)
    if (!existing || existing.publisherId !== publisherId) {
      throw new PublisherManagedAdsError('NOT_FOUND', 'NOT_FOUND')
    }
    if (existing.status === 'ARCHIVED') {
      throw new PublisherManagedAdsError('ALREADY_ARCHIVED', 'VALIDATION')
    }

    let patch: ReturnType<typeof validateUpdateAdInput>
    try {
      patch = validateUpdateAdInput(raw)
    } catch (err) {
      wrapValidation(err)
    }

    const nextInventoryId = patch.inventoryId ?? existing.inventoryId
    const nextStart = patch.startAt ?? existing.startAt
    const nextEnd = patch.endAt ?? existing.endAt
    const nextStatus = patch.status ?? existing.status

    if (patch.inventoryId) {
      await this.assertInventoryOwned(publisherId, patch.inventoryId)
    }

    await this.assertNoScheduleConflict(
      nextInventoryId,
      nextStart,
      nextEnd,
      nextStatus,
      adId
    )

    const updated = await this.repo.updateAd(adId, publisherId, {
      ...patch,
      updatedBy: userId,
    })
    if (!updated) throw new PublisherManagedAdsError('NOT_FOUND', 'NOT_FOUND')
    publisherLog('publisher_managed_ad_updated', { publisherId, adId, userId })
    return updated
  }

  async archive(
    publisherId: string,
    adId: string,
    userId: string
  ): Promise<PublisherManagedAdRecord> {
    this.assertEnabled()
    await requirePublisherMember(publisherId, userId, 'ads:archive', this.publisherRepo)
    const existing = await this.repo.findAd(adId)
    if (!existing || existing.publisherId !== publisherId) {
      throw new PublisherManagedAdsError('NOT_FOUND', 'NOT_FOUND')
    }
    const updated = await this.repo.updateAd(adId, publisherId, {
      status: 'ARCHIVED',
      archivedAt: new Date(),
      updatedBy: userId,
    })
    if (!updated) throw new PublisherManagedAdsError('NOT_FOUND', 'NOT_FOUND')
    publisherLog('publisher_managed_ad_archived', { publisherId, adId, userId })
    return updated
  }

  async createCreative(
    publisherId: string,
    adId: string,
    userId: string,
    raw: PublisherAdCreativeCreateInput
  ): Promise<PublisherAdCreativeRecord> {
    this.assertEnabled()
    await requirePublisherMember(publisherId, userId, 'ads:update', this.publisherRepo)
    const publisher = await this.publisherRepo.findById(publisherId)
    if (!publisher) throw new PublisherManagedAdsError('PUBLISHER_NOT_FOUND', 'NOT_FOUND')
    assertCanMutatePublisher(publisher)

    const ad = await this.repo.findAd(adId)
    if (!ad || ad.publisherId !== publisherId) {
      throw new PublisherManagedAdsError('NOT_FOUND', 'NOT_FOUND')
    }
    if (ad.status === 'ARCHIVED') {
      throw new PublisherManagedAdsError('ALREADY_ARCHIVED', 'VALIDATION')
    }

    let input: ReturnType<typeof validateCreativeInput>
    try {
      input = validateCreativeInput(raw)
    } catch (err) {
      wrapValidation(err)
    }

    const version = (await this.repo.maxCreativeVersion(adId)) + 1
    const now = new Date()
    const creative: PublisherAdCreativeRecord = {
      id: newPublisherId('pacr'),
      publisherId,
      adId,
      creativeType: input.creativeType,
      mediaUrl: input.mediaUrl,
      thumbnailUrl: input.thumbnailUrl,
      headline: input.headline,
      body: input.body,
      altText: input.altText,
      durationSeconds: input.durationSeconds,
      version,
      isCurrent: true,
      createdAt: now,
      updatedAt: now,
    }
    await this.repo.insertCreative(creative)
    publisherLog('publisher_ad_creative_created', {
      publisherId,
      adId,
      creativeId: creative.id,
      version,
      userId,
    })
    return creative
  }

  /** Public serving resolve — no auth. Flag + eligibility gated. */
  async resolveActivePublisherAd(
    inventoryId: string,
    now: Date = new Date()
  ): Promise<ResolvedPublisherAd | null> {
    if (!isPublisherSelfManagedAdsEnabled() || !isPublisherAdServingEnabled()) {
      return null
    }
    const resolved = await this.repo.resolveActiveForInventory(inventoryId, now)
    if (!resolved) return null
    if (!isAdEligibleNow(resolved.ad, now)) return null
    return resolved
  }

  async resolveByAdId(adId: string, now: Date = new Date()): Promise<ResolvedPublisherAd | null> {
    if (!isPublisherSelfManagedAdsEnabled() || !isPublisherAdServingEnabled()) {
      return null
    }
    const ad = await this.repo.findAd(adId)
    if (!ad || !isAdEligibleNow(ad, now)) return null
    const creative = await this.repo.currentCreative(adId)
    if (!creative?.mediaUrl) return null
    const publisher = await this.publisherRepo.findById(ad.publisherId)
    if (
      !publisher ||
      publisher.status !== 'ACTIVE' ||
      publisher.verificationStatus !== 'VERIFIED'
    ) {
      return null
    }
    const inv = await this.inventoryRepo.findById(ad.inventoryId)
    if (!inv || inv.status !== 'ACTIVE') return null
    return { ad, creative, clickHref: `/r/ad/${ad.id}` }
  }

  async recordImpression(input: {
    adId: string
    creativeId?: string | null
    userId?: string | null
    sessionId?: string | null
    deviceClass?: string | null
    referrerType?: string | null
    dedupeKey?: string | null
  }): Promise<{ recorded: boolean }> {
    if (!isPublisherSelfManagedAdsEnabled() || !isPublisherAdServingEnabled()) {
      return { recorded: false }
    }
    if (isSyntheticAdActor(input)) {
      return { recorded: false }
    }
    const resolved = await this.resolveByAdId(input.adId)
    if (!resolved) return { recorded: false }
    const creativeId = input.creativeId || resolved.creative.id
    if (creativeId !== resolved.creative.id) return { recorded: false }

    const ok = await this.repo.insertImpression({
      id: newPublisherId('paimp'),
      adId: resolved.ad.id,
      creativeId,
      inventoryId: resolved.ad.inventoryId,
      publisherId: resolved.ad.publisherId,
      userId: input.userId ?? null,
      sessionId: input.sessionId ?? null,
      deviceClass: input.deviceClass ?? null,
      referrerType: input.referrerType ?? null,
      dedupeKey: input.dedupeKey?.slice(0, 160) || null,
    })
    return { recorded: ok }
  }

  /**
   * Record click and return server-stored destination only.
   * Never trust client-supplied redirect URLs.
   */
  async recordClickAndGetDestination(input: {
    adId: string
    userId?: string | null
    sessionId?: string | null
    impressionId?: string | null
  }): Promise<{ destinationUrl: string } | null> {
    if (!isPublisherSelfManagedAdsEnabled() || !isPublisherAdServingEnabled()) {
      return null
    }
    const resolved = await this.resolveByAdId(input.adId)
    if (!resolved) return null
    const dest = resolved.ad.destinationUrl?.trim()
    if (!dest) return null
    let parsed: URL
    try {
      parsed = new URL(dest)
    } catch {
      return null
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null

    if (!isSyntheticAdActor(input)) {
      await this.repo.insertClick({
        id: newPublisherId('paclk'),
        adId: resolved.ad.id,
        creativeId: resolved.creative.id,
        inventoryId: resolved.ad.inventoryId,
        publisherId: resolved.ad.publisherId,
        impressionId: input.impressionId ?? null,
        userId: input.userId ?? null,
        sessionId: input.sessionId ?? null,
        destinationUrlSnapshot: parsed.toString(),
      })
    }
    return { destinationUrl: parsed.toString() }
  }

  async analytics(
    publisherId: string,
    userId: string,
    from: Date,
    to: Date,
    adId?: string
  ): Promise<PublisherAdAnalyticsSummary> {
    this.assertEnabled()
    if (!isPublisherAdAnalyticsEnabled()) {
      throw new PublisherManagedAdsError('ANALYTICS_DISABLED', 'FLAG_OFF')
    }
    await requirePublisherMember(publisherId, userId, 'ads:read', this.publisherRepo)
    if (adId) {
      const ad = await this.repo.findAd(adId)
      if (!ad || ad.publisherId !== publisherId) {
        throw new PublisherManagedAdsError('NOT_FOUND', 'NOT_FOUND')
      }
    }
    return this.repo.analytics(publisherId, from, to, adId)
  }

  async runScheduleTick(limit = 50): Promise<{ activated: number; ended: number; skipped?: boolean }> {
    if (!isPublisherSelfManagedAdsEnabled()) {
      return { activated: 0, ended: 0, skipped: true }
    }
    const result = await this.repo.tickSchedule(new Date(), limit)
    publisherLog('publisher_ad_schedule_tick', result)
    return result
  }
}

export const publisherManagedAdsService = new PublisherManagedAdsService()
