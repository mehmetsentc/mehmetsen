import { isAdInventoryEffectiveForPublisher } from '@/lib/publisher/effectiveFlags'
import {
  AdInventoryValidationError,
  normalizeCreateInput,
  normalizeUpdateInput,
  toFeedContract,
  validateMoney,
  type FeedAdInventoryContract,
} from '@/lib/publisher/adInventoryDomain'
import { publisherLog } from '@/lib/publisher/observability'
import type {
  AdInventoryCreateInput,
  AdInventoryDashboardCounts,
  AdInventoryUpdateInput,
  AdSaleStatus,
  PublisherAdInventoryAuditRecord,
  PublisherAdInventoryRecord,
} from '@/types/publisherAdInventory'
import type { PublisherRecord } from '@/types/publisher'
import { requirePublisherMember } from './publisherLayoutService'
import {
  PublisherAdInventoryRepository,
  publisherAdInventoryRepository,
} from './publisherAdInventoryRepository'
import { PublisherRepository, publisherRepository } from './publisherRepository'

export class PublisherAdInventoryError extends Error {
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
      | 'SUSPENDED' = 'VALIDATION'
  ) {
    super(message)
    this.name = 'PublisherAdInventoryError'
  }
}

function assertCanMutatePublisher(publisher: PublisherRecord): void {
  if (publisher.verificationStatus === 'UNCLAIMED' || publisher.status === 'UNCLAIMED') {
    throw new PublisherAdInventoryError('UNCLAIMED', 'UNCLAIMED')
  }
  if (publisher.verificationStatus !== 'VERIFIED') {
    throw new PublisherAdInventoryError('VERIFIED_REQUIRED', 'UNVERIFIED')
  }
  if (publisher.status === 'SUSPENDED' || publisher.status === 'INACTIVE') {
    // Public listing off is enforced separately; mutate still blocked for suspended
    if (publisher.status === 'SUSPENDED') {
      throw new PublisherAdInventoryError('PUBLISHER_SUSPENDED', 'SUSPENDED')
    }
  }
}

function publicListingAllowed(publisher: PublisherRecord): boolean {
  return publisher.status === 'ACTIVE' && publisher.verificationStatus === 'VERIFIED'
}

export class PublisherAdInventoryService {
  constructor(
    private readonly repo: PublisherAdInventoryRepository = publisherAdInventoryRepository,
    private readonly publisherRepo: PublisherRepository = publisherRepository
  ) {}

  private async assertEnabled(publisherId: string) {
    if (!(await isAdInventoryEffectiveForPublisher(publisherId))) {
      throw new PublisherAdInventoryError('AD_INVENTORY_DISABLED', 'FLAG_OFF')
    }
  }

  async list(
    publisherId: string,
    userId: string,
    opts?: { includeArchived?: boolean }
  ): Promise<PublisherAdInventoryRecord[]> {
    await this.assertEnabled(publisherId)
    await requirePublisherMember(publisherId, userId, 'ads:read', this.publisherRepo)
    return this.repo.listForPublisher(publisherId, opts)
  }

  async get(
    publisherId: string,
    inventoryId: string,
    userId: string
  ): Promise<PublisherAdInventoryRecord> {
    await this.assertEnabled(publisherId)
    await requirePublisherMember(publisherId, userId, 'ads:read', this.publisherRepo)
    const item = await this.repo.findById(inventoryId)
    if (!item || item.publisherId !== publisherId) {
      throw new PublisherAdInventoryError('NOT_FOUND', 'NOT_FOUND')
    }
    return item
  }

  async dashboard(publisherId: string, userId: string): Promise<AdInventoryDashboardCounts> {
    await this.assertEnabled(publisherId)
    await requirePublisherMember(publisherId, userId, 'ads:read', this.publisherRepo)
    return this.repo.dashboardCounts(publisherId)
  }

  async create(
    publisherId: string,
    userId: string,
    raw: AdInventoryCreateInput
  ): Promise<PublisherAdInventoryRecord> {
    await this.assertEnabled(publisherId)
    await requirePublisherMember(publisherId, userId, 'ads:create', this.publisherRepo)
    const publisher = await this.publisherRepo.findById(publisherId)
    if (!publisher) throw new PublisherAdInventoryError('PUBLISHER_NOT_FOUND', 'NOT_FOUND')
    assertCanMutatePublisher(publisher)

    let input: AdInventoryCreateInput
    try {
      input = normalizeCreateInput(raw)
    } catch (err) {
      if (err instanceof AdInventoryValidationError) {
        throw new PublisherAdInventoryError(err.message, 'VALIDATION')
      }
      throw err
    }

    // Users cannot create PLATFORM ownership
    if ((raw as { ownershipType?: string }).ownershipType === 'PLATFORM') {
      throw new PublisherAdInventoryError('PLATFORM_OWNERSHIP_FORBIDDEN', 'FORBIDDEN')
    }

    if (input.isPubliclyListed && !publicListingAllowed(publisher)) {
      input = { ...input, isPubliclyListed: false }
    }

    const item = await this.repo.create(publisherId, userId, input)
    await this.repo.writeAudit({
      inventoryId: item.id,
      publisherId,
      eventType: 'CREATED',
      actorUserId: userId,
      payload: { inventoryType: item.inventoryType, placementScope: item.placementScope },
    })
    publisherLog('publisher_ad_inventory_created', {
      publisherId,
      inventoryId: item.id,
      userId,
      inventoryType: item.inventoryType,
    })
    return item
  }

  async update(
    publisherId: string,
    inventoryId: string,
    userId: string,
    raw: AdInventoryUpdateInput
  ): Promise<PublisherAdInventoryRecord> {
    await this.assertEnabled(publisherId)
    await requirePublisherMember(publisherId, userId, 'ads:update', this.publisherRepo)
    const publisher = await this.publisherRepo.findById(publisherId)
    if (!publisher) throw new PublisherAdInventoryError('PUBLISHER_NOT_FOUND', 'NOT_FOUND')
    assertCanMutatePublisher(publisher)

    const existing = await this.repo.findById(inventoryId)
    if (!existing || existing.publisherId !== publisherId) {
      throw new PublisherAdInventoryError('NOT_FOUND', 'NOT_FOUND')
    }
    if (existing.status === 'ARCHIVED') {
      throw new PublisherAdInventoryError('ALREADY_ARCHIVED', 'VALIDATION')
    }

    let patch: AdInventoryUpdateInput
    try {
      patch = normalizeUpdateInput(raw)
    } catch (err) {
      if (err instanceof AdInventoryValidationError) {
        throw new PublisherAdInventoryError(err.message, 'VALIDATION')
      }
      throw err
    }

    // Resolve money when only price fields change
    if (
      (raw.priceMinor !== undefined || raw.currency !== undefined) &&
      raw.pricingModel === undefined
    ) {
      try {
        const money = validateMoney(
          existing.pricingModel,
          raw.priceMinor !== undefined ? raw.priceMinor : existing.priceMinor,
          raw.currency ?? existing.currency
        )
        patch.priceMinor = money.priceMinor
        patch.currency = money.currency
      } catch (err) {
        if (err instanceof AdInventoryValidationError) {
          throw new PublisherAdInventoryError(err.message, 'VALIDATION')
        }
        throw err
      }
    }

    if (patch.isPubliclyListed && !publicListingAllowed(publisher)) {
      patch.isPubliclyListed = false
    }

    const updated = await this.repo.update(inventoryId, publisherId, userId, patch)
    if (!updated) throw new PublisherAdInventoryError('NOT_FOUND', 'NOT_FOUND')

    await this.repo.writeAudit({
      inventoryId,
      publisherId,
      eventType: 'UPDATED',
      actorUserId: userId,
      payload: { fields: Object.keys(patch) },
    })
    publisherLog('publisher_ad_inventory_updated', { publisherId, inventoryId, userId })
    return updated
  }

  async setSaleStatus(
    publisherId: string,
    inventoryId: string,
    userId: string,
    saleStatus: AdSaleStatus,
    isPubliclyListed?: boolean
  ): Promise<PublisherAdInventoryRecord> {
    await this.assertEnabled(publisherId)
    await requirePublisherMember(publisherId, userId, 'ads:publish', this.publisherRepo)
    return this.update(publisherId, inventoryId, userId, {
      saleStatus,
      ...(isPubliclyListed !== undefined ? { isPubliclyListed } : {}),
    }).then(async (item) => {
      publisherLog('publisher_ad_inventory_sale_toggled', {
        publisherId,
        inventoryId,
        saleStatus,
        userId,
      })
      return item
    })
  }

  async archive(
    publisherId: string,
    inventoryId: string,
    userId: string
  ): Promise<PublisherAdInventoryRecord> {
    await this.assertEnabled(publisherId)
    await requirePublisherMember(publisherId, userId, 'ads:archive', this.publisherRepo)
    const archived = await this.repo.archive(inventoryId, publisherId, userId)
    if (!archived) throw new PublisherAdInventoryError('NOT_FOUND', 'NOT_FOUND')
    await this.repo.writeAudit({
      inventoryId,
      publisherId,
      eventType: 'ARCHIVED',
      actorUserId: userId,
    })
    publisherLog('publisher_ad_inventory_archived', { publisherId, inventoryId, userId })
    return archived
  }

  async listAudit(
    publisherId: string,
    inventoryId: string,
    userId: string
  ): Promise<PublisherAdInventoryAuditRecord[]> {
    await this.assertEnabled(publisherId)
    await requirePublisherMember(publisherId, userId, 'ads:read', this.publisherRepo)
    const item = await this.repo.findById(inventoryId)
    if (!item || item.publisherId !== publisherId) {
      throw new PublisherAdInventoryError('NOT_FOUND', 'NOT_FOUND')
    }
    return this.repo.listAudit(inventoryId)
  }

  /** Public sellable listings — no auth. Respects publisher status. */
  async listPublicSellable(publisherId: string): Promise<PublisherAdInventoryRecord[]> {
    const publisher = await this.publisherRepo.findById(publisherId)
    if (!publisher || !publicListingAllowed(publisher)) return []
    return this.repo.listPubliclyAvailable(publisherId)
  }

  async getArticlePlacements(publisherId: string): Promise<PublisherAdInventoryRecord[]> {
    return this.repo.listArticlePolicies(publisherId)
  }

  async getFeedContracts(publisherId: string): Promise<FeedAdInventoryContract[]> {
    const rows = await this.repo.listFeedContracts(publisherId)
    return rows.map(toFeedContract)
  }

  async attachToLayoutItem(
    publisherId: string,
    inventoryId: string,
    layoutItemId: string,
    userId: string
  ): Promise<PublisherAdInventoryRecord> {
    await this.assertEnabled(publisherId)
    await requirePublisherMember(publisherId, userId, 'ads:update', this.publisherRepo)
    const existingAttach = await this.repo.findByLayoutItemId(layoutItemId)
    if (existingAttach && existingAttach.id !== inventoryId) {
      throw new PublisherAdInventoryError('LAYOUT_ITEM_ALREADY_ATTACHED', 'VALIDATION')
    }
    const updated = await this.repo.attachLayoutItem(inventoryId, publisherId, layoutItemId, userId)
    if (!updated) throw new PublisherAdInventoryError('NOT_FOUND', 'NOT_FOUND')
    await this.repo.writeAudit({
      inventoryId,
      publisherId,
      eventType: 'LAYOUT_ATTACHED',
      actorUserId: userId,
      payload: { layoutItemId },
    })
    return updated
  }

  async detachLayoutItem(layoutItemId: string): Promise<void> {
    // Detach does not delete inventory
    await this.repo.detachLayoutItem(layoutItemId)
  }
}

export const publisherAdInventoryService = new PublisherAdInventoryService()
