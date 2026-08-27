import { and, asc, desc, eq, gt, gte, inArray, lt, lte, ne, or, sql, type SQL } from 'drizzle-orm'
import { getDb } from '@/db'
import {
  adBookingRequests,
  adBookings,
  advertiserCampaigns,
  advertiserCreatives,
  advertiserMembers,
  advertisers,
  marketplaceAuditEvents,
} from '@/db/schema/advertiserMarketplace'
import { publisherAdInventory } from '@/db/schema/publisherAdInventory'
import { publishers } from '@/db/schema/publishers'
import { newAdvertiserId } from '@/lib/advertiser/id'
import type {
  AdBookingRecord,
  AdBookingRequestRecord,
  AdvertiserCampaignRecord,
  AdvertiserCreativeRecord,
  AdvertiserMemberRecord,
  AdvertiserRecord,
  BookingRequestStatus,
  BookingStatus,
  MarketplaceAuditEventType,
  MarketplaceBrowseFilters,
  MarketplaceInventoryCard,
} from '@/types/advertiserMarketplace'

function requireDb() {
  return getDb()
}

function mapAdvertiser(r: typeof advertisers.$inferSelect): AdvertiserRecord {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    advertiserType: r.advertiserType as AdvertiserRecord['advertiserType'],
    status: r.status as AdvertiserRecord['status'],
    websiteUrl: r.websiteUrl,
    city: r.city,
    country: r.country,
    logoUrl: r.logoUrl,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function mapMember(r: typeof advertiserMembers.$inferSelect): AdvertiserMemberRecord {
  return {
    id: r.id,
    advertiserId: r.advertiserId,
    userId: r.userId,
    role: r.role as AdvertiserMemberRecord['role'],
    status: r.status as AdvertiserMemberRecord['status'],
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function mapCampaign(r: typeof advertiserCampaigns.$inferSelect): AdvertiserCampaignRecord {
  return {
    id: r.id,
    advertiserId: r.advertiserId,
    name: r.name,
    objective: r.objective as AdvertiserCampaignRecord['objective'],
    status: r.status as AdvertiserCampaignRecord['status'],
    startAt: r.startAt,
    endAt: r.endAt,
    budgetMinor: r.budgetMinor == null ? null : Number(r.budgetMinor),
    currency: r.currency,
    createdBy: r.createdBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function mapCreative(r: typeof advertiserCreatives.$inferSelect): AdvertiserCreativeRecord {
  return {
    id: r.id,
    advertiserId: r.advertiserId,
    campaignId: r.campaignId,
    name: r.name,
    creativeType: r.creativeType as AdvertiserCreativeRecord['creativeType'],
    headline: r.headline,
    body: r.body,
    mediaUrl: r.mediaUrl,
    destinationUrl: r.destinationUrl,
    status: r.status as AdvertiserCreativeRecord['status'],
    platformModerationStatus:
      r.platformModerationStatus as AdvertiserCreativeRecord['platformModerationStatus'],
    version: r.version,
    createdBy: r.createdBy,
    updatedBy: r.updatedBy,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function mapRequest(r: typeof adBookingRequests.$inferSelect): AdBookingRequestRecord {
  return {
    id: r.id,
    advertiserId: r.advertiserId,
    campaignId: r.campaignId,
    publisherId: r.publisherId,
    inventoryId: r.inventoryId,
    creativeId: r.creativeId,
    status: r.status as BookingRequestStatus,
    requestedStartAt: r.requestedStartAt,
    requestedEndAt: r.requestedEndAt,
    requestedImpressions: r.requestedImpressions,
    priceSnapshotMinor: r.priceSnapshotMinor == null ? null : Number(r.priceSnapshotMinor),
    pricingModelSnapshot: r.pricingModelSnapshot,
    durationSnapshot: r.durationSnapshot,
    impressionSnapshot: r.impressionSnapshot,
    currency: r.currency,
    message: r.message,
    publisherOfferMinor: r.publisherOfferMinor == null ? null : Number(r.publisherOfferMinor),
    publisherNote: r.publisherNote,
    creativeReviewStatus: r.creativeReviewStatus as AdBookingRequestRecord['creativeReviewStatus'],
    expiresAt: r.expiresAt,
    createdBy: r.createdBy,
    publisherReviewedBy: r.publisherReviewedBy,
    publisherReviewedAt: r.publisherReviewedAt,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

function mapBooking(r: typeof adBookings.$inferSelect): AdBookingRecord {
  return {
    id: r.id,
    bookingRequestId: r.bookingRequestId,
    advertiserId: r.advertiserId,
    campaignId: r.campaignId,
    publisherId: r.publisherId,
    inventoryId: r.inventoryId,
    creativeId: r.creativeId,
    creativeSnapshot: r.creativeSnapshot ?? null,
    status: r.status as BookingStatus,
    startAt: r.startAt,
    endAt: r.endAt,
    impressionLimit: r.impressionLimit,
    priceMinor: r.priceMinor == null ? null : Number(r.priceMinor),
    currency: r.currency,
    pricingModelSnapshot: r.pricingModelSnapshot,
    grossAmountMinor: r.grossAmountMinor == null ? null : Number(r.grossAmountMinor),
    platformCommissionRateBps: r.platformCommissionRateBps ?? null,
    platformCommissionMinor:
      r.platformCommissionMinor == null ? null : Number(r.platformCommissionMinor),
    publisherGrossMinor: r.publisherGrossMinor == null ? null : Number(r.publisherGrossMinor),
    publisherNetMinor: r.publisherNetMinor == null ? null : Number(r.publisherNetMinor),
    taxPlaceholderMinor: r.taxPlaceholderMinor == null ? null : Number(r.taxPlaceholderMinor),
    invoiceStatus: r.invoiceStatus ?? null,
    taxProfileId: r.taxProfileId ?? null,
    commercialSnapshotAt: r.commercialSnapshotAt ?? null,
    commercialFrozen: Boolean(r.commercialFrozen),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }
}

export class AdvertiserMarketplaceRepository {
  async findAdvertiserById(id: string): Promise<AdvertiserRecord | null> {
    const db = requireDb()
    const rows = await db.select().from(advertisers).where(eq(advertisers.id, id)).limit(1)
    return rows[0] ? mapAdvertiser(rows[0]) : null
  }

  async findAdvertiserBySlug(slug: string): Promise<AdvertiserRecord | null> {
    const db = requireDb()
    const rows = await db.select().from(advertisers).where(eq(advertisers.slug, slug)).limit(1)
    return rows[0] ? mapAdvertiser(rows[0]) : null
  }

  async createAdvertiserWithOwner(input: {
    name: string
    slug: string
    advertiserType: string
    websiteUrl: string | null
    city: string | null
    country: string | null
    createdBy: string
  }): Promise<{ advertiser: AdvertiserRecord; member: AdvertiserMemberRecord }> {
    const db = requireDb()
    const now = new Date()
    const advertiserId = newAdvertiserId('adv')
    const memberId = newAdvertiserId('amem')
    await db.insert(advertisers).values({
      id: advertiserId,
      name: input.name,
      slug: input.slug,
      advertiserType: input.advertiserType,
      status: 'ACTIVE',
      websiteUrl: input.websiteUrl,
      city: input.city,
      country: input.country,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    })
    await db.insert(advertiserMembers).values({
      id: memberId,
      advertiserId,
      userId: input.createdBy,
      role: 'OWNER',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    })
    const advertiser = (await this.findAdvertiserById(advertiserId))!
    const member = (await this.findMember(advertiserId, input.createdBy))!
    return { advertiser, member }
  }

  async findMember(advertiserId: string, userId: string): Promise<AdvertiserMemberRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(advertiserMembers)
      .where(
        and(
          eq(advertiserMembers.advertiserId, advertiserId),
          eq(advertiserMembers.userId, userId),
          eq(advertiserMembers.status, 'ACTIVE')
        )
      )
      .limit(1)
    return rows[0] ? mapMember(rows[0]) : null
  }

  async listMembershipsForUser(userId: string): Promise<
    Array<{ advertiser: AdvertiserRecord; role: AdvertiserMemberRecord['role'] }>
  > {
    const db = requireDb()
    const rows = await db
      .select({ advertiser: advertisers, role: advertiserMembers.role })
      .from(advertiserMembers)
      .innerJoin(advertisers, eq(advertiserMembers.advertiserId, advertisers.id))
      .where(and(eq(advertiserMembers.userId, userId), eq(advertiserMembers.status, 'ACTIVE')))
    return rows.map((r) => ({
      advertiser: mapAdvertiser(r.advertiser),
      role: r.role as AdvertiserMemberRecord['role'],
    }))
  }

  async createCampaign(input: {
    advertiserId: string
    name: string
    objective: string
    status: string
    startAt: Date | null
    endAt: Date | null
    budgetMinor: number | null
    currency: string
    createdBy: string
  }): Promise<AdvertiserCampaignRecord> {
    const db = requireDb()
    const now = new Date()
    const id = newAdvertiserId('acamp')
    await db.insert(advertiserCampaigns).values({
      id,
      advertiserId: input.advertiserId,
      name: input.name,
      objective: input.objective,
      status: input.status,
      startAt: input.startAt,
      endAt: input.endAt,
      budgetMinor: input.budgetMinor,
      currency: input.currency,
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    })
    return (await this.findCampaignById(id))!
  }

  async findCampaignById(id: string): Promise<AdvertiserCampaignRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(advertiserCampaigns)
      .where(eq(advertiserCampaigns.id, id))
      .limit(1)
    return rows[0] ? mapCampaign(rows[0]) : null
  }

  async listCampaigns(advertiserId: string): Promise<AdvertiserCampaignRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(advertiserCampaigns)
      .where(eq(advertiserCampaigns.advertiserId, advertiserId))
      .orderBy(desc(advertiserCampaigns.updatedAt))
    return rows.map(mapCampaign)
  }

  async updateCampaignStatus(id: string, status: string): Promise<void> {
    const db = requireDb()
    await db
      .update(advertiserCampaigns)
      .set({ status, updatedAt: new Date() })
      .where(eq(advertiserCampaigns.id, id))
  }

  async createCreative(input: {
    advertiserId: string
    campaignId: string | null
    name: string
    creativeType: string
    headline: string | null
    body: string | null
    mediaUrl: string | null
    destinationUrl: string | null
    status: string
    createdBy: string
  }): Promise<AdvertiserCreativeRecord> {
    const db = requireDb()
    const now = new Date()
    const id = newAdvertiserId('acr')
    await db.insert(advertiserCreatives).values({
      id,
      advertiserId: input.advertiserId,
      campaignId: input.campaignId,
      name: input.name,
      creativeType: input.creativeType,
      headline: input.headline,
      body: input.body,
      mediaUrl: input.mediaUrl,
      destinationUrl: input.destinationUrl,
      status: input.status,
      platformModerationStatus: 'PENDING',
      version: 1,
      createdBy: input.createdBy,
      updatedBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    })
    return (await this.findCreativeById(id))!
  }

  async findCreativeById(id: string): Promise<AdvertiserCreativeRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(advertiserCreatives)
      .where(eq(advertiserCreatives.id, id))
      .limit(1)
    return rows[0] ? mapCreative(rows[0]) : null
  }

  async listCreatives(advertiserId: string): Promise<AdvertiserCreativeRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(advertiserCreatives)
      .where(eq(advertiserCreatives.advertiserId, advertiserId))
      .orderBy(desc(advertiserCreatives.updatedAt))
    return rows.map(mapCreative)
  }

  async updateCreative(
    id: string,
    patch: Partial<{
      name: string
      headline: string | null
      body: string | null
      mediaUrl: string | null
      destinationUrl: string | null
      status: string
      platformModerationStatus: string
      updatedBy: string
      version: number
    }>
  ): Promise<AdvertiserCreativeRecord | null> {
    const db = requireDb()
    await db
      .update(advertiserCreatives)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(advertiserCreatives.id, id))
    return this.findCreativeById(id)
  }

  async createBookingRequest(input: {
    advertiserId: string
    campaignId: string
    publisherId: string
    inventoryId: string
    creativeId: string | null
    status: string
    requestedStartAt: Date
    requestedEndAt: Date
    requestedImpressions: number | null
    priceSnapshotMinor: number | null
    pricingModelSnapshot: string
    durationSnapshot: number | null
    impressionSnapshot: number | null
    currency: string
    message: string | null
    expiresAt: Date | null
    createdBy: string
  }): Promise<AdBookingRequestRecord> {
    const db = requireDb()
    const now = new Date()
    const id = newAdvertiserId('abr')
    await db.insert(adBookingRequests).values({
      id,
      ...input,
      publisherOfferMinor: null,
      publisherNote: null,
      creativeReviewStatus: input.creativeId ? 'PENDING' : null,
      createdAt: now,
      updatedAt: now,
    })
    return (await this.findRequestById(id))!
  }

  async findRequestById(id: string): Promise<AdBookingRequestRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(adBookingRequests)
      .where(eq(adBookingRequests.id, id))
      .limit(1)
    return rows[0] ? mapRequest(rows[0]) : null
  }

  async listRequestsForAdvertiser(advertiserId: string): Promise<AdBookingRequestRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(adBookingRequests)
      .where(eq(adBookingRequests.advertiserId, advertiserId))
      .orderBy(desc(adBookingRequests.updatedAt))
    return rows.map(mapRequest)
  }

  async listRequestsForPublisher(publisherId: string): Promise<AdBookingRequestRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(adBookingRequests)
      .where(
        and(
          eq(adBookingRequests.publisherId, publisherId),
          inArray(adBookingRequests.status, [
            'SUBMITTED',
            'UNDER_REVIEW',
            'OFFERED',
            'APPROVED',
            'REJECTED',
          ])
        )
      )
      .orderBy(desc(adBookingRequests.updatedAt))
    return rows.map(mapRequest)
  }

  async listRequestsForCampaign(campaignId: string): Promise<AdBookingRequestRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(adBookingRequests)
      .where(eq(adBookingRequests.campaignId, campaignId))
      .orderBy(desc(adBookingRequests.updatedAt))
    return rows.map(mapRequest)
  }

  /**
   * Conditional status transition. Returns updated row or null if precondition failed.
   */
  async transitionRequestStatus(
    id: string,
    fromStatuses: BookingRequestStatus[],
    toStatus: BookingRequestStatus,
    patch: Partial<{
      publisherReviewedBy: string
      publisherReviewedAt: Date
      publisherNote: string | null
      publisherOfferMinor: number | null
      creativeReviewStatus: string | null
      priceSnapshotMinor: number | null
    }> = {}
  ): Promise<AdBookingRequestRecord | null> {
    const db = requireDb()
    const updated = await db
      .update(adBookingRequests)
      .set({
        status: toStatus,
        updatedAt: new Date(),
        ...patch,
      })
      .where(and(eq(adBookingRequests.id, id), inArray(adBookingRequests.status, fromStatuses)))
      .returning()
    return updated[0] ? mapRequest(updated[0]) : null
  }

  async findOverlappingActiveBookings(
    inventoryId: string,
    start: Date,
    end: Date,
    excludeBookingId?: string
  ): Promise<AdBookingRecord[]> {
    const db = requireDb()
    const conditions: SQL[] = [
      eq(adBookings.inventoryId, inventoryId),
      inArray(adBookings.status, [
        'PENDING_PAYMENT',
        'PAYMENT_PROCESSING',
        'PAID_PENDING_DELIVERY',
        'READY',
        'COMPLETED',
      ]),
      lt(adBookings.startAt, end),
      gt(adBookings.endAt, start),
    ]
    if (excludeBookingId) {
      conditions.push(ne(adBookings.id, excludeBookingId))
    }
    const rows = await db
      .select()
      .from(adBookings)
      .where(and(...conditions))
    return rows.map(mapBooking)
  }

  async createBookingIdempotent(input: {
    bookingRequestId: string
    advertiserId: string
    campaignId: string
    publisherId: string
    inventoryId: string
    creativeId: string | null
    creativeSnapshot: Record<string, unknown> | null
    startAt: Date
    endAt: Date
    impressionLimit: number | null
    priceMinor: number | null
    currency: string
    pricingModelSnapshot: string
    grossAmountMinor?: number | null
    platformCommissionRateBps?: number | null
    platformCommissionMinor?: number | null
    publisherGrossMinor?: number | null
    publisherNetMinor?: number | null
    taxPlaceholderMinor?: number | null
    commercialSnapshotAt?: Date | null
    commercialFrozen?: boolean
  }): Promise<{ booking: AdBookingRecord; created: boolean }> {
    const existing = await this.findBookingByRequestId(input.bookingRequestId)
    if (existing) return { booking: existing, created: false }

    const db = requireDb()
    const now = new Date()
    const id = newAdvertiserId('abook')
    try {
      await db.insert(adBookings).values({
        id,
        bookingRequestId: input.bookingRequestId,
        advertiserId: input.advertiserId,
        campaignId: input.campaignId,
        publisherId: input.publisherId,
        inventoryId: input.inventoryId,
        creativeId: input.creativeId,
        creativeSnapshot: input.creativeSnapshot,
        status: 'PENDING_PAYMENT',
        startAt: input.startAt,
        endAt: input.endAt,
        impressionLimit: input.impressionLimit,
        priceMinor: input.priceMinor,
        currency: input.currency,
        pricingModelSnapshot: input.pricingModelSnapshot,
        grossAmountMinor: input.grossAmountMinor ?? null,
        platformCommissionRateBps: input.platformCommissionRateBps ?? null,
        platformCommissionMinor: input.platformCommissionMinor ?? null,
        publisherGrossMinor: input.publisherGrossMinor ?? null,
        publisherNetMinor: input.publisherNetMinor ?? null,
        taxPlaceholderMinor: input.taxPlaceholderMinor ?? null,
        commercialSnapshotAt: input.commercialSnapshotAt ?? null,
        commercialFrozen: input.commercialFrozen ?? false,
        createdAt: now,
        updatedAt: now,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('unique') || msg.includes('duplicate') || msg.includes('ad_bookings_request')) {
        const again = await this.findBookingByRequestId(input.bookingRequestId)
        if (again) return { booking: again, created: false }
      }
      throw err
    }
    return { booking: (await this.findBookingById(id))!, created: true }
  }

  async transitionBookingStatus(
    bookingId: string,
    fromStatuses: BookingStatus[],
    toStatus: BookingStatus
  ): Promise<AdBookingRecord | null> {
    const db = requireDb()
    const updated = await db
      .update(adBookings)
      .set({ status: toStatus, updatedAt: new Date() })
      .where(and(eq(adBookings.id, bookingId), inArray(adBookings.status, fromStatuses)))
      .returning()
    return updated[0] ? mapBooking(updated[0]) : null
  }

  async freezeCommercialSnapshot(
    bookingId: string,
    snap: {
      grossAmountMinor: number
      platformCommissionRateBps: number
      platformCommissionMinor: number
      publisherGrossMinor: number
      publisherNetMinor: number
      taxPlaceholderMinor: number | null
    }
  ): Promise<AdBookingRecord | null> {
    const db = requireDb()
    const updated = await db
      .update(adBookings)
      .set({
        grossAmountMinor: snap.grossAmountMinor,
        platformCommissionRateBps: snap.platformCommissionRateBps,
        platformCommissionMinor: snap.platformCommissionMinor,
        publisherGrossMinor: snap.publisherGrossMinor,
        publisherNetMinor: snap.publisherNetMinor,
        taxPlaceholderMinor: snap.taxPlaceholderMinor,
        priceMinor: snap.grossAmountMinor,
        commercialSnapshotAt: new Date(),
        commercialFrozen: true,
        updatedAt: new Date(),
      })
      .where(and(eq(adBookings.id, bookingId), eq(adBookings.commercialFrozen, false)))
      .returning()
    return updated[0] ? mapBooking(updated[0]) : null
  }

  async findBookingById(id: string): Promise<AdBookingRecord | null> {
    const db = requireDb()
    const rows = await db.select().from(adBookings).where(eq(adBookings.id, id)).limit(1)
    return rows[0] ? mapBooking(rows[0]) : null
  }

  async findBookingByRequestId(requestId: string): Promise<AdBookingRecord | null> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(adBookings)
      .where(eq(adBookings.bookingRequestId, requestId))
      .limit(1)
    return rows[0] ? mapBooking(rows[0]) : null
  }

  async listBookingsForPublisher(publisherId: string): Promise<AdBookingRecord[]> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(adBookings)
      .where(eq(adBookings.publisherId, publisherId))
      .orderBy(asc(adBookings.startAt))
    return rows.map(mapBooking)
  }

  async writeAudit(input: {
    eventType: MarketplaceAuditEventType
    actorUserId: string | null
    advertiserId?: string | null
    publisherId?: string | null
    entityType?: string | null
    entityId?: string | null
    payload?: Record<string, unknown> | null
  }): Promise<void> {
    const db = requireDb()
    await db.insert(marketplaceAuditEvents).values({
      id: newAdvertiserId('maud'),
      eventType: input.eventType,
      actorUserId: input.actorUserId,
      advertiserId: input.advertiserId ?? null,
      publisherId: input.publisherId ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload ?? null,
      createdAt: new Date(),
    })
  }

  /**
   * Marketplace browse — only ACTIVE+VERIFIED publishers and ACTIVE+AVAILABLE+public inventory.
   */
  async browseMarketplace(
    filters: MarketplaceBrowseFilters
  ): Promise<{ items: MarketplaceInventoryCard[]; nextCursor: string | null }> {
    const db = requireDb()
    const limit = Math.min(Math.max(filters.limit ?? 24, 1), 50)
    const conditions: SQL[] = [
      eq(publishers.status, 'ACTIVE'),
      eq(publishers.verificationStatus, 'VERIFIED'),
      eq(publisherAdInventory.status, 'ACTIVE'),
      eq(publisherAdInventory.saleStatus, 'AVAILABLE'),
      eq(publisherAdInventory.isPubliclyListed, true),
    ]

    if (filters.city?.trim()) {
      conditions.push(sql`lower(${publishers.city}) = lower(${filters.city.trim()})`)
    }
    if (filters.district?.trim()) {
      conditions.push(sql`lower(${publishers.district}) = lower(${filters.district.trim()})`)
    }
    if (filters.publisherId) {
      conditions.push(eq(publisherAdInventory.publisherId, filters.publisherId))
    }
    if (filters.inventoryType) {
      conditions.push(eq(publisherAdInventory.inventoryType, filters.inventoryType))
    }
    if (filters.placementScope) {
      conditions.push(eq(publisherAdInventory.placementScope, filters.placementScope))
    }
    if (filters.format) {
      conditions.push(eq(publisherAdInventory.format, filters.format))
    }
    if (filters.pricingModel) {
      conditions.push(eq(publisherAdInventory.pricingModel, filters.pricingModel))
    }
    if (filters.priceMinMinor != null) {
      conditions.push(gte(publisherAdInventory.priceMinor, filters.priceMinMinor))
    }
    if (filters.priceMaxMinor != null) {
      conditions.push(lte(publisherAdInventory.priceMinor, filters.priceMaxMinor))
    }
    if (filters.q?.trim()) {
      const q = `%${filters.q.trim().toLowerCase()}%`
      conditions.push(
        or(
          sql`lower(${publisherAdInventory.name}) like ${q}`,
          sql`lower(${publishers.name}) like ${q}`,
          sql`lower(${publishers.displayName}) like ${q}`,
          sql`lower(coalesce(${publishers.city}, '')) like ${q}`
        )!
      )
    }

    const rows = await db
      .select({
        inventory: publisherAdInventory,
        publisher: publishers,
      })
      .from(publisherAdInventory)
      .innerJoin(publishers, eq(publisherAdInventory.publisherId, publishers.id))
      .where(and(...conditions))
      .orderBy(desc(publisherAdInventory.createdAt), desc(publisherAdInventory.id))
      .limit(200)

    const preferred = filters.preferredCity?.trim() || filters.city?.trim() || null
    const sort = filters.sort ?? 'recommended'

    let scored = rows.map((r) => {
      const inv = r.inventory
      const pub = r.publisher
      const local =
        preferred &&
        pub.city &&
        pub.city.toLocaleLowerCase('tr') === preferred.toLocaleLowerCase('tr')
      return { inv, pub, local: Boolean(local) }
    })

    if (sort === 'price_asc') {
      scored = scored.sort(
        (a, b) => (a.inv.priceMinor ?? Number.MAX_SAFE_INTEGER) - (b.inv.priceMinor ?? Number.MAX_SAFE_INTEGER)
      )
    } else if (sort === 'price_desc') {
      scored = scored.sort((a, b) => (b.inv.priceMinor ?? -1) - (a.inv.priceMinor ?? -1))
    } else if (sort === 'newest') {
      scored = scored.sort((a, b) => b.inv.createdAt.getTime() - a.inv.createdAt.getTime())
    } else {
      scored = scored.sort((a, b) => {
        if (a.local !== b.local) return a.local ? -1 : 1
        return b.inv.createdAt.getTime() - a.inv.createdAt.getTime()
      })
    }

    // Cursor: skip until after cursor id
    let startIdx = 0
    if (filters.cursor) {
      try {
        const decoded = JSON.parse(Buffer.from(filters.cursor, 'base64url').toString('utf8')) as {
          id?: string
        }
        if (decoded.id) {
          const idx = scored.findIndex((s) => s.inv.id === decoded.id)
          if (idx >= 0) startIdx = idx + 1
        }
      } catch {
        /* ignore bad cursor */
      }
    }

    const page = scored.slice(startIdx, startIdx + limit)
    const items: MarketplaceInventoryCard[] = page.map(({ inv, pub }) => ({
      inventoryId: inv.id,
      name: inv.name,
      description: inv.description,
      inventoryType: inv.inventoryType,
      placementScope: inv.placementScope,
      format: inv.format,
      pricingModel: inv.pricingModel,
      priceMinor: inv.priceMinor == null ? null : Number(inv.priceMinor),
      currency: inv.currency,
      periodDays: inv.periodDays,
      impressionCap: inv.impressionCap,
      saleStatus: inv.saleStatus,
      previewNote: inv.previewNote,
      publisher: {
        id: pub.id,
        slug: pub.slug,
        name: pub.name,
        displayName: pub.displayName,
        logoUrl: pub.logoUrl,
        city: pub.city,
        district: pub.district,
        description: pub.description,
        verificationStatus: pub.verificationStatus,
      },
    }))

    const last = page[page.length - 1]
    const nextCursor =
      last && startIdx + limit < scored.length
        ? Buffer.from(JSON.stringify({ id: last.inv.id }), 'utf8').toString('base64url')
        : null

    return { items, nextCursor }
  }

  async getMarketplaceInventoryDetail(inventoryId: string): Promise<MarketplaceInventoryCard | null> {
    const { items } = await this.browseMarketplace({ publisherId: undefined, limit: 1 })
    // Direct eligible lookup
    const db = requireDb()
    const rows = await db
      .select({ inventory: publisherAdInventory, publisher: publishers })
      .from(publisherAdInventory)
      .innerJoin(publishers, eq(publisherAdInventory.publisherId, publishers.id))
      .where(
        and(
          eq(publisherAdInventory.id, inventoryId),
          eq(publishers.status, 'ACTIVE'),
          eq(publishers.verificationStatus, 'VERIFIED'),
          eq(publisherAdInventory.status, 'ACTIVE'),
          eq(publisherAdInventory.saleStatus, 'AVAILABLE'),
          eq(publisherAdInventory.isPubliclyListed, true)
        )
      )
      .limit(1)
    if (!rows[0]) {
      void items
      return null
    }
    const { inventory: inv, publisher: pub } = rows[0]
    return {
      inventoryId: inv.id,
      name: inv.name,
      description: inv.description,
      inventoryType: inv.inventoryType,
      placementScope: inv.placementScope,
      format: inv.format,
      pricingModel: inv.pricingModel,
      priceMinor: inv.priceMinor == null ? null : Number(inv.priceMinor),
      currency: inv.currency,
      periodDays: inv.periodDays,
      impressionCap: inv.impressionCap,
      saleStatus: inv.saleStatus,
      previewNote: inv.previewNote,
      publisher: {
        id: pub.id,
        slug: pub.slug,
        name: pub.name,
        displayName: pub.displayName,
        logoUrl: pub.logoUrl,
        city: pub.city,
        district: pub.district,
        description: pub.description,
        verificationStatus: pub.verificationStatus,
      },
    }
  }
}

export const advertiserMarketplaceRepository = new AdvertiserMarketplaceRepository()
