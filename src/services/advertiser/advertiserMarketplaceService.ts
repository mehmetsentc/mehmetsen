import {
  advertiserRoleHasPermission,
  type AdvertiserPermission,
} from '@/lib/advertiser/authorization'
import {
  isAdBookingRequestsEnabled,
  isAdCreativeSubmissionEnabled,
  isAdMarketplaceEnabled,
  isAdvertiserPlatformEnabled,
} from '@/lib/advertiser/marketplaceFlags'
import {
  defaultRequestExpiresAt,
  MarketplaceValidationError,
  normalizeCreateAdvertiser,
  normalizeCreateBookingRequest,
  normalizeCreateCampaign,
  normalizeCreateCreative,
  validateRequestAgainstPricing,
} from '@/lib/advertiser/marketplaceDomain'
import { slugifyPublisherName, resolveUniquePublisherSlug } from '@/lib/publisher/slug'
import { notificationService } from '@/services/notificationService'
import type {
  AdBookingRecord,
  AdBookingRequestRecord,
  AdvertiserCampaignRecord,
  AdvertiserCreativeRecord,
  AdvertiserMemberRecord,
  AdvertiserRecord,
  CreateAdvertiserInput,
  CreateBookingRequestInput,
  CreateCampaignInput,
  CreateCreativeInput,
  MarketplaceBrowseFilters,
  MarketplaceInventoryCard,
} from '@/types/advertiserMarketplace'
import type { AdPricingModel } from '@/types/publisherAdInventory'
import {
  adInventoryAvailabilityService,
  AdInventoryAvailabilityService,
  isInventoryMarketplaceEligible,
} from './adInventoryAvailabilityService'
import {
  AdvertiserMarketplaceRepository,
  advertiserMarketplaceRepository,
} from './advertiserMarketplaceRepository'
import {
  PublisherAdInventoryRepository,
  publisherAdInventoryRepository,
} from '../publisher/publisherAdInventoryRepository'
import { PublisherRepository, publisherRepository } from '../publisher/publisherRepository'
import { requirePublisherMember } from '../publisher/publisherLayoutService'

export class MarketplaceError extends Error {
  constructor(
    message: string,
    readonly code:
      | 'DISABLED'
      | 'FLAG_OFF'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'VALIDATION'
      | 'CONFLICT'
      | 'INVENTORY_DATE_CONFLICT'
      | 'NOT_ELIGIBLE'
      | 'SUSPENDED'
      | 'ALREADY_PROCESSED' = 'VALIDATION'
  ) {
    super(message)
    this.name = 'MarketplaceError'
  }
}

async function notifyBestEffort(userId: string, text: string, actorId?: string) {
  try {
    await notificationService.createNotification({
      userId,
      type: 'system',
      text,
      actorId,
    })
  } catch {
    /* non-fatal */
  }
}

export class AdvertiserMarketplaceService {
  constructor(
    private readonly repo: AdvertiserMarketplaceRepository = advertiserMarketplaceRepository,
    private readonly inventoryRepo: PublisherAdInventoryRepository = publisherAdInventoryRepository,
    private readonly publisherRepo: PublisherRepository = publisherRepository,
    private readonly availability: AdInventoryAvailabilityService = adInventoryAvailabilityService
  ) {}

  private assertPlatform() {
    if (!isAdvertiserPlatformEnabled()) {
      throw new MarketplaceError('ADVERTISER_PLATFORM_DISABLED', 'FLAG_OFF')
    }
  }

  private assertMarketplace() {
    if (!isAdMarketplaceEnabled()) {
      throw new MarketplaceError('AD_MARKETPLACE_DISABLED', 'FLAG_OFF')
    }
  }

  private assertBooking() {
    if (!isAdBookingRequestsEnabled()) {
      throw new MarketplaceError('AD_BOOKING_REQUESTS_DISABLED', 'FLAG_OFF')
    }
  }

  private assertCreative() {
    if (!isAdCreativeSubmissionEnabled()) {
      throw new MarketplaceError('AD_CREATIVE_SUBMISSION_DISABLED', 'FLAG_OFF')
    }
  }

  async requireAdvertiserMember(
    advertiserId: string,
    userId: string,
    permission: AdvertiserPermission
  ): Promise<{ advertiser: AdvertiserRecord; member: AdvertiserMemberRecord }> {
    this.assertPlatform()
    const advertiser = await this.repo.findAdvertiserById(advertiserId)
    if (!advertiser) throw new MarketplaceError('ADVERTISER_NOT_FOUND', 'NOT_FOUND')
    if (advertiser.status === 'SUSPENDED') {
      throw new MarketplaceError('ADVERTISER_SUSPENDED', 'SUSPENDED')
    }
    const member = await this.repo.findMember(advertiserId, userId)
    if (!member) throw new MarketplaceError('NOT_MEMBER', 'FORBIDDEN')
    if (!advertiserRoleHasPermission(member.role, permission)) {
      throw new MarketplaceError('FORBIDDEN', 'FORBIDDEN')
    }
    return { advertiser, member }
  }

  async onboard(
    userId: string,
    raw: CreateAdvertiserInput
  ): Promise<{ advertiser: AdvertiserRecord; member: AdvertiserMemberRecord }> {
    this.assertPlatform()
    let input: CreateAdvertiserInput
    try {
      input = normalizeCreateAdvertiser(raw)
    } catch (err) {
      if (err instanceof MarketplaceValidationError) {
        throw new MarketplaceError(err.message, 'VALIDATION')
      }
      throw err
    }

    const { slug } = await resolveUniquePublisherSlug(input.name, async (s) => {
      const existing = await this.repo.findAdvertiserBySlug(s)
      return Boolean(existing)
    })

    const created = await this.repo.createAdvertiserWithOwner({
      name: input.name,
      slug: slug || slugifyPublisherName(input.name),
      advertiserType: input.advertiserType,
      websiteUrl: input.websiteUrl ?? null,
      city: input.city ?? null,
      country: input.country ?? 'TR',
      createdBy: userId,
    })

    await this.repo.writeAudit({
      eventType: 'ADVERTISER_CREATED',
      actorUserId: userId,
      advertiserId: created.advertiser.id,
      entityType: 'advertiser',
      entityId: created.advertiser.id,
    })

    return created
  }

  async listMyAdvertisers(userId: string) {
    this.assertPlatform()
    return this.repo.listMembershipsForUser(userId)
  }

  async browse(filters: MarketplaceBrowseFilters) {
    this.assertMarketplace()
    return this.repo.browseMarketplace(filters)
  }

  async getInventoryDetail(inventoryId: string): Promise<MarketplaceInventoryCard> {
    this.assertMarketplace()
    const item = await this.repo.getMarketplaceInventoryDetail(inventoryId)
    if (!item) throw new MarketplaceError('NOT_FOUND', 'NOT_FOUND')
    return item
  }

  async createCampaign(
    advertiserId: string,
    userId: string,
    raw: CreateCampaignInput
  ): Promise<AdvertiserCampaignRecord> {
    await this.requireAdvertiserMember(advertiserId, userId, 'campaigns:write')
    let input: CreateCampaignInput
    try {
      input = normalizeCreateCampaign(raw)
    } catch (err) {
      if (err instanceof MarketplaceValidationError) {
        throw new MarketplaceError(err.message, 'VALIDATION')
      }
      throw err
    }

    const campaign = await this.repo.createCampaign({
      advertiserId,
      name: input.name,
      objective: input.objective,
      status: 'DRAFT',
      startAt: input.startAt ? new Date(input.startAt) : null,
      endAt: input.endAt ? new Date(input.endAt) : null,
      budgetMinor: input.budgetMinor ?? null,
      currency: input.currency ?? 'TRY',
      createdBy: userId,
    })

    await this.repo.writeAudit({
      eventType: 'CAMPAIGN_CREATED',
      actorUserId: userId,
      advertiserId,
      entityType: 'campaign',
      entityId: campaign.id,
    })

    return campaign
  }

  async listCampaigns(advertiserId: string, userId: string) {
    await this.requireAdvertiserMember(advertiserId, userId, 'campaigns:read')
    return this.repo.listCampaigns(advertiserId)
  }

  async createBookingRequest(
    advertiserId: string,
    userId: string,
    raw: CreateBookingRequestInput,
    opts?: { submit?: boolean }
  ): Promise<AdBookingRequestRecord> {
    this.assertBooking()
    await this.requireAdvertiserMember(advertiserId, userId, 'requests:write')

    let normalized: ReturnType<typeof normalizeCreateBookingRequest>
    try {
      normalized = normalizeCreateBookingRequest(raw)
    } catch (err) {
      if (err instanceof MarketplaceValidationError) {
        throw new MarketplaceError(err.message, 'VALIDATION')
      }
      throw err
    }

    const campaign = await this.repo.findCampaignById(normalized.campaignId)
    if (!campaign || campaign.advertiserId !== advertiserId) {
      throw new MarketplaceError('CAMPAIGN_NOT_FOUND', 'NOT_FOUND')
    }

    const inventory = await this.inventoryRepo.findById(normalized.inventoryId)
    if (!inventory) throw new MarketplaceError('INVENTORY_NOT_FOUND', 'NOT_FOUND')

    const publisher = await this.publisherRepo.findById(inventory.publisherId)
    if (!publisher) throw new MarketplaceError('PUBLISHER_NOT_FOUND', 'NOT_FOUND')

    if (!isInventoryMarketplaceEligible(inventory, publisher)) {
      throw new MarketplaceError('INVENTORY_NOT_ELIGIBLE', 'NOT_ELIGIBLE')
    }

    try {
      validateRequestAgainstPricing(
        inventory.pricingModel as AdPricingModel,
        normalized.requestedImpressions,
        normalized.message
      )
    } catch (err) {
      if (err instanceof MarketplaceValidationError) {
        throw new MarketplaceError(err.message, 'VALIDATION')
      }
      throw err
    }

    if (normalized.creativeId) {
      const creative = await this.repo.findCreativeById(normalized.creativeId)
      if (!creative || creative.advertiserId !== advertiserId) {
        throw new MarketplaceError('CREATIVE_NOT_FOUND', 'NOT_FOUND')
      }
    }

    // Server-side price snapshot — never trust client
    const priceSnapshotMinor =
      inventory.pricingModel === 'CONTACT_FOR_PRICE' ? null : inventory.priceMinor

    const status = opts?.submit ? 'SUBMITTED' : 'DRAFT'
    const request = await this.repo.createBookingRequest({
      advertiserId,
      campaignId: campaign.id,
      publisherId: publisher.id,
      inventoryId: inventory.id,
      creativeId: normalized.creativeId,
      status,
      requestedStartAt: normalized.requestedStartAt,
      requestedEndAt: normalized.requestedEndAt,
      requestedImpressions: normalized.requestedImpressions,
      priceSnapshotMinor,
      pricingModelSnapshot: inventory.pricingModel,
      durationSnapshot: inventory.periodDays,
      impressionSnapshot: inventory.impressionCap,
      currency: inventory.currency,
      message: normalized.message,
      expiresAt: opts?.submit ? defaultRequestExpiresAt() : null,
      createdBy: userId,
    })

    if (campaign.status === 'DRAFT') {
      await this.repo.updateCampaignStatus(campaign.id, 'ACTIVE_REQUESTING')
    }

    await this.repo.writeAudit({
      eventType: opts?.submit ? 'BOOKING_REQUEST_SUBMITTED' : 'BOOKING_REQUEST_CREATED',
      actorUserId: userId,
      advertiserId,
      publisherId: publisher.id,
      entityType: 'booking_request',
      entityId: request.id,
      payload: {
        priceSnapshotMinor,
        pricingModelSnapshot: inventory.pricingModel,
      },
    })

    if (opts?.submit) {
      const owners = await this.publisherRepo.listMembersForPublisher(publisher.id)
      for (const m of owners) {
        if (m.status !== 'ACTIVE') continue
        if (m.role === 'OWNER' || m.role === 'ADMIN' || m.role === 'AD_MANAGER') {
          await notifyBestEffort(
            m.userId,
            `Yeni reklam talebi: ${inventory.name}`,
            userId
          )
        }
      }
    }

    return request
  }

  async submitBookingRequest(
    advertiserId: string,
    userId: string,
    requestId: string
  ): Promise<AdBookingRequestRecord> {
    this.assertBooking()
    await this.requireAdvertiserMember(advertiserId, userId, 'requests:write')
    const existing = await this.repo.findRequestById(requestId)
    if (!existing || existing.advertiserId !== advertiserId) {
      throw new MarketplaceError('NOT_FOUND', 'NOT_FOUND')
    }
    const updated = await this.repo.transitionRequestStatus(requestId, ['DRAFT'], 'SUBMITTED', {
      /* expires set via re-fetch path — patch expires in transition */
    })
    if (!updated) throw new MarketplaceError('INVALID_STATUS', 'VALIDATION')

    // Re-apply expires_at
    const withExpiry = await this.repo.transitionRequestStatus(
      requestId,
      ['SUBMITTED'],
      'SUBMITTED',
      {}
    )
    const finalReq = withExpiry ?? updated

    // Direct update for expires_at if needed — use create path semantics
    await this.repo.writeAudit({
      eventType: 'BOOKING_REQUEST_SUBMITTED',
      actorUserId: userId,
      advertiserId,
      publisherId: finalReq.publisherId,
      entityType: 'booking_request',
      entityId: finalReq.id,
    })
    return finalReq
  }

  async cancelBookingRequest(
    advertiserId: string,
    userId: string,
    requestId: string
  ): Promise<AdBookingRequestRecord> {
    this.assertBooking()
    await this.requireAdvertiserMember(advertiserId, userId, 'requests:write')
    const existing = await this.repo.findRequestById(requestId)
    if (!existing || existing.advertiserId !== advertiserId) {
      throw new MarketplaceError('NOT_FOUND', 'NOT_FOUND')
    }
    const updated = await this.repo.transitionRequestStatus(
      requestId,
      ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'OFFERED'],
      'CANCELLED'
    )
    if (!updated) throw new MarketplaceError('CANNOT_CANCEL', 'VALIDATION')
    await this.repo.writeAudit({
      eventType: 'REQUEST_CANCELLED',
      actorUserId: userId,
      advertiserId,
      publisherId: updated.publisherId,
      entityType: 'booking_request',
      entityId: updated.id,
    })
    return updated
  }

  async listAdvertiserRequests(advertiserId: string, userId: string) {
    await this.requireAdvertiserMember(advertiserId, userId, 'requests:read')
    return this.repo.listRequestsForAdvertiser(advertiserId)
  }

  async listCampaignRequests(advertiserId: string, userId: string, campaignId: string) {
    await this.requireAdvertiserMember(advertiserId, userId, 'requests:read')
    const campaign = await this.repo.findCampaignById(campaignId)
    if (!campaign || campaign.advertiserId !== advertiserId) {
      throw new MarketplaceError('NOT_FOUND', 'NOT_FOUND')
    }
    return this.repo.listRequestsForCampaign(campaignId)
  }

  async listPublisherRequests(publisherId: string, userId: string) {
    this.assertBooking()
    await requirePublisherMember(publisherId, userId, 'ads:requests:read', this.publisherRepo)
    return this.repo.listRequestsForPublisher(publisherId)
  }

  async listPublisherBookings(publisherId: string, userId: string) {
    this.assertBooking()
    await requirePublisherMember(publisherId, userId, 'ads:bookings:read', this.publisherRepo)
    return this.repo.listBookingsForPublisher(publisherId)
  }

  /**
   * Atomic approval: conditional status transition + idempotent booking insert.
   * Concurrent double-approve → one booking. Date conflict → INVENTORY_DATE_CONFLICT.
   */
  async approveRequest(
    publisherId: string,
    userId: string,
    requestId: string,
    opts?: { publisherNote?: string | null; publisherOfferMinor?: number | null }
  ): Promise<{ request: AdBookingRequestRecord; booking: AdBookingRecord }> {
    this.assertBooking()
    await requirePublisherMember(publisherId, userId, 'ads:requests:review', this.publisherRepo)

    const existing = await this.repo.findRequestById(requestId)
    if (!existing || existing.publisherId !== publisherId) {
      throw new MarketplaceError('NOT_FOUND', 'NOT_FOUND')
    }

    // Idempotent: already approved
    if (existing.status === 'APPROVED') {
      const booking = await this.repo.findBookingByRequestId(requestId)
      if (booking) return { request: existing, booking }
    }

    const publisher = await this.publisherRepo.findById(publisherId)
    if (!publisher || publisher.status === 'SUSPENDED' || publisher.status !== 'ACTIVE') {
      throw new MarketplaceError('PUBLISHER_NOT_APPROVABLE', 'SUSPENDED')
    }
    if (publisher.verificationStatus !== 'VERIFIED') {
      throw new MarketplaceError('PUBLISHER_NOT_VERIFIED', 'NOT_ELIGIBLE')
    }

    const inventory = await this.inventoryRepo.findById(existing.inventoryId)
    if (!inventory || inventory.status === 'ARCHIVED' || inventory.status !== 'ACTIVE') {
      throw new MarketplaceError('INVENTORY_NOT_APPROVABLE', 'NOT_ELIGIBLE')
    }

    const avail = await this.availability.check(
      existing.inventoryId,
      existing.requestedStartAt,
      existing.requestedEndAt
    )
    if (avail.result === 'CONFLICT') {
      throw new MarketplaceError('INVENTORY_DATE_CONFLICT', 'INVENTORY_DATE_CONFLICT')
    }
    if (avail.result === 'NOT_SELLABLE') {
      throw new MarketplaceError('INVENTORY_NOT_ELIGIBLE', 'NOT_ELIGIBLE')
    }

    let priceMinor = existing.priceSnapshotMinor
    if (existing.pricingModelSnapshot === 'CONTACT_FOR_PRICE') {
      if (opts?.publisherOfferMinor == null && existing.publisherOfferMinor == null) {
        throw new MarketplaceError('OFFER_REQUIRED', 'VALIDATION')
      }
      priceMinor = opts?.publisherOfferMinor ?? existing.publisherOfferMinor
    }

    const transitioned = await this.repo.transitionRequestStatus(
      requestId,
      ['SUBMITTED', 'UNDER_REVIEW', 'OFFERED'],
      'APPROVED',
      {
        publisherReviewedBy: userId,
        publisherReviewedAt: new Date(),
        publisherNote: opts?.publisherNote ?? existing.publisherNote,
        publisherOfferMinor: priceMinor ?? existing.publisherOfferMinor,
        creativeReviewStatus: existing.creativeId ? 'ACCEPTED' : null,
        priceSnapshotMinor: priceMinor,
      }
    )

    if (!transitioned) {
      // Lost race — another approver won, or invalid status
      const again = await this.repo.findRequestById(requestId)
      if (again?.status === 'APPROVED') {
        const booking = await this.repo.findBookingByRequestId(requestId)
        if (booking) return { request: again, booking }
      }
      throw new MarketplaceError('ALREADY_PROCESSED', 'ALREADY_PROCESSED')
    }

    // Re-check conflict after winning transition (another booking may have slipped in)
    const conflictRecheck = await this.repo.findOverlappingActiveBookings(
      existing.inventoryId,
      existing.requestedStartAt,
      existing.requestedEndAt
    )
    if (conflictRecheck.length > 0) {
      // Roll back approval if we can (best-effort) — leave as APPROVED only if we create booking
      // Prefer fail: revert to UNDER_REVIEW
      await this.repo.transitionRequestStatus(requestId, ['APPROVED'], 'UNDER_REVIEW', {
        publisherReviewedBy: userId,
        publisherReviewedAt: new Date(),
        publisherNote: 'INVENTORY_DATE_CONFLICT',
      })
      throw new MarketplaceError('INVENTORY_DATE_CONFLICT', 'INVENTORY_DATE_CONFLICT')
    }

    let creativeSnapshot: Record<string, unknown> | null = null
    if (existing.creativeId) {
      const creative = await this.repo.findCreativeById(existing.creativeId)
      if (creative) {
        creativeSnapshot = {
          id: creative.id,
          name: creative.name,
          creativeType: creative.creativeType,
          headline: creative.headline,
          body: creative.body,
          mediaUrl: creative.mediaUrl,
          destinationUrl: creative.destinationUrl,
          version: creative.version,
          status: creative.status,
        }
      }
    }

    const { booking, created } = await this.repo.createBookingIdempotent({
      bookingRequestId: requestId,
      advertiserId: existing.advertiserId,
      campaignId: existing.campaignId,
      publisherId,
      inventoryId: existing.inventoryId,
      creativeId: existing.creativeId,
      creativeSnapshot,
      startAt: existing.requestedStartAt,
      endAt: existing.requestedEndAt,
      impressionLimit: existing.requestedImpressions ?? existing.impressionSnapshot,
      priceMinor,
      currency: existing.currency,
      pricingModelSnapshot: existing.pricingModelSnapshot,
    })

    if (created) {
      await this.repo.writeAudit({
        eventType: 'REQUEST_APPROVED',
        actorUserId: userId,
        advertiserId: existing.advertiserId,
        publisherId,
        entityType: 'booking_request',
        entityId: requestId,
      })
      await this.repo.writeAudit({
        eventType: 'BOOKING_CREATED',
        actorUserId: userId,
        advertiserId: existing.advertiserId,
        publisherId,
        entityType: 'booking',
        entityId: booking.id,
        payload: { status: 'PENDING_PAYMENT', priceMinor },
      })
      await notifyBestEffort(
        existing.createdBy,
        'Reklam talebiniz onaylandı (ödeme bekleniyor).',
        userId
      )
    }

    return { request: transitioned, booking }
  }

  async rejectRequest(
    publisherId: string,
    userId: string,
    requestId: string,
    note?: string | null
  ): Promise<AdBookingRequestRecord> {
    this.assertBooking()
    await requirePublisherMember(publisherId, userId, 'ads:requests:review', this.publisherRepo)
    const existing = await this.repo.findRequestById(requestId)
    if (!existing || existing.publisherId !== publisherId) {
      throw new MarketplaceError('NOT_FOUND', 'NOT_FOUND')
    }
    const updated = await this.repo.transitionRequestStatus(
      requestId,
      ['SUBMITTED', 'UNDER_REVIEW', 'OFFERED'],
      'REJECTED',
      {
        publisherReviewedBy: userId,
        publisherReviewedAt: new Date(),
        publisherNote: note ?? null,
        creativeReviewStatus: existing.creativeId ? 'REJECTED' : null,
      }
    )
    if (!updated) throw new MarketplaceError('ALREADY_PROCESSED', 'ALREADY_PROCESSED')
    await this.repo.writeAudit({
      eventType: 'REQUEST_REJECTED',
      actorUserId: userId,
      advertiserId: existing.advertiserId,
      publisherId,
      entityType: 'booking_request',
      entityId: requestId,
    })
    await notifyBestEffort(existing.createdBy, 'Reklam talebiniz reddedildi.', userId)
    return updated
  }

  async offerOnRequest(
    publisherId: string,
    userId: string,
    requestId: string,
    publisherOfferMinor: number,
    note?: string | null
  ): Promise<AdBookingRequestRecord> {
    this.assertBooking()
    await requirePublisherMember(publisherId, userId, 'ads:requests:review', this.publisherRepo)
    if (!Number.isInteger(publisherOfferMinor) || publisherOfferMinor < 0) {
      throw new MarketplaceError('INVALID_OFFER', 'VALIDATION')
    }
    const existing = await this.repo.findRequestById(requestId)
    if (!existing || existing.publisherId !== publisherId) {
      throw new MarketplaceError('NOT_FOUND', 'NOT_FOUND')
    }
    const updated = await this.repo.transitionRequestStatus(
      requestId,
      ['SUBMITTED', 'UNDER_REVIEW', 'OFFERED'],
      'OFFERED',
      {
        publisherOfferMinor,
        publisherNote: note ?? null,
        publisherReviewedBy: userId,
        publisherReviewedAt: new Date(),
      }
    )
    if (!updated) throw new MarketplaceError('ALREADY_PROCESSED', 'ALREADY_PROCESSED')
    await this.repo.writeAudit({
      eventType: 'REQUEST_OFFERED',
      actorUserId: userId,
      advertiserId: existing.advertiserId,
      publisherId,
      entityType: 'booking_request',
      entityId: requestId,
      payload: { publisherOfferMinor },
    })
    await notifyBestEffort(existing.createdBy, 'Yayıncı teklif gönderdi.', userId)
    return updated
  }

  async createCreative(
    advertiserId: string,
    userId: string,
    raw: CreateCreativeInput
  ): Promise<AdvertiserCreativeRecord> {
    this.assertCreative()
    await this.requireAdvertiserMember(advertiserId, userId, 'creatives:write')
    let input: CreateCreativeInput
    try {
      input = normalizeCreateCreative(raw)
    } catch (err) {
      if (err instanceof MarketplaceValidationError) {
        throw new MarketplaceError(err.message, 'VALIDATION')
      }
      throw err
    }
    if (input.campaignId) {
      const campaign = await this.repo.findCampaignById(input.campaignId)
      if (!campaign || campaign.advertiserId !== advertiserId) {
        throw new MarketplaceError('CAMPAIGN_NOT_FOUND', 'NOT_FOUND')
      }
    }
    const creative = await this.repo.createCreative({
      advertiserId,
      campaignId: input.campaignId ?? null,
      name: input.name,
      creativeType: input.creativeType,
      headline: input.headline ?? null,
      body: input.body ?? null,
      mediaUrl: input.mediaUrl ?? null,
      destinationUrl: input.destinationUrl ?? null,
      status: 'DRAFT',
      createdBy: userId,
    })
    await this.repo.writeAudit({
      eventType: 'CREATIVE_CREATED',
      actorUserId: userId,
      advertiserId,
      entityType: 'creative',
      entityId: creative.id,
    })
    return creative
  }

  async submitCreative(
    advertiserId: string,
    userId: string,
    creativeId: string
  ): Promise<AdvertiserCreativeRecord> {
    this.assertCreative()
    await this.requireAdvertiserMember(advertiserId, userId, 'creatives:write')
    const existing = await this.repo.findCreativeById(creativeId)
    if (!existing || existing.advertiserId !== advertiserId) {
      throw new MarketplaceError('NOT_FOUND', 'NOT_FOUND')
    }
    if (existing.status === 'APPROVED') {
      throw new MarketplaceError('ALREADY_APPROVED', 'VALIDATION')
    }
    const updated = await this.repo.updateCreative(creativeId, {
      status: 'SUBMITTED',
      platformModerationStatus: 'PENDING',
      updatedBy: userId,
    })
    await this.repo.writeAudit({
      eventType: 'CREATIVE_SUBMITTED',
      actorUserId: userId,
      advertiserId,
      entityType: 'creative',
      entityId: creativeId,
    })
    return updated!
  }

  async listCreatives(advertiserId: string, userId: string) {
    await this.requireAdvertiserMember(advertiserId, userId, 'creatives:read')
    return this.repo.listCreatives(advertiserId)
  }

  async attachCreativeMedia(
    advertiserId: string,
    userId: string,
    creativeId: string,
    mediaUrl: string
  ): Promise<AdvertiserCreativeRecord> {
    this.assertCreative()
    await this.requireAdvertiserMember(advertiserId, userId, 'creatives:write')
    const existing = await this.repo.findCreativeById(creativeId)
    if (!existing || existing.advertiserId !== advertiserId) {
      throw new MarketplaceError('NOT_FOUND', 'NOT_FOUND')
    }
    // Editing approved creative returns to DRAFT
    const nextStatus = existing.status === 'APPROVED' || existing.status === 'SUBMITTED' ? 'DRAFT' : existing.status
    const updated = await this.repo.updateCreative(creativeId, {
      mediaUrl,
      status: nextStatus,
      updatedBy: userId,
      version: existing.version + (existing.status === 'APPROVED' ? 1 : 0),
    })
    return updated!
  }
}

export const advertiserMarketplaceService = new AdvertiserMarketplaceService()
