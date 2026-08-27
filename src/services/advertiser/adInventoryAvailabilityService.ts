import type { AvailabilityResult } from '@/types/advertiserMarketplace'
import type { PublisherAdInventoryRecord } from '@/types/publisherAdInventory'
import type { PublisherRecord } from '@/types/publisher'
import {
  AdvertiserMarketplaceRepository,
  advertiserMarketplaceRepository,
} from './advertiserMarketplaceRepository'
import { PublisherAdInventoryRepository, publisherAdInventoryRepository } from '../publisher/publisherAdInventoryRepository'
import { PublisherRepository, publisherRepository } from '../publisher/publisherRepository'

export function isInventoryMarketplaceEligible(
  inventory: PublisherAdInventoryRecord,
  publisher: PublisherRecord
): boolean {
  return (
    publisher.status === 'ACTIVE' &&
    publisher.verificationStatus === 'VERIFIED' &&
    inventory.status === 'ACTIVE' &&
    inventory.saleStatus === 'AVAILABLE' &&
    inventory.isPubliclyListed === true
  )
}

export class AdInventoryAvailabilityService {
  constructor(
    private readonly marketplaceRepo: AdvertiserMarketplaceRepository = advertiserMarketplaceRepository,
    private readonly inventoryRepo: PublisherAdInventoryRepository = publisherAdInventoryRepository,
    private readonly publisherRepo: PublisherRepository = publisherRepository
  ) {}

  async check(
    inventoryId: string,
    start: Date,
    end: Date
  ): Promise<{ result: AvailabilityResult; reason?: string }> {
    if (!(end.getTime() > start.getTime())) {
      return { result: 'NOT_SELLABLE', reason: 'INVALID_DATE_RANGE' }
    }

    const inventory = await this.inventoryRepo.findById(inventoryId)
    if (!inventory) return { result: 'NOT_SELLABLE', reason: 'NOT_FOUND' }

    const publisher = await this.publisherRepo.findById(inventory.publisherId)
    if (!publisher) return { result: 'NOT_SELLABLE', reason: 'PUBLISHER_NOT_FOUND' }

    if (!isInventoryMarketplaceEligible(inventory, publisher)) {
      return { result: 'NOT_SELLABLE', reason: 'NOT_ELIGIBLE' }
    }

    if (publisher.status === 'SUSPENDED' || inventory.status === 'ARCHIVED') {
      return { result: 'NOT_SELLABLE', reason: 'NOT_ELIGIBLE' }
    }

    const overlaps = await this.marketplaceRepo.findOverlappingActiveBookings(
      inventoryId,
      start,
      end
    )
    if (overlaps.length > 0) {
      return { result: 'CONFLICT', reason: 'INVENTORY_DATE_CONFLICT' }
    }

    return { result: 'AVAILABLE' }
  }
}

export const adInventoryAvailabilityService = new AdInventoryAvailabilityService()
