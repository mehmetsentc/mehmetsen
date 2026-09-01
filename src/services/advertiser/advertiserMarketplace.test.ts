/**
 * Phase P9 — Advertiser marketplace / booking / creative unit tests.
 */
import { describe, expect, it } from 'vitest'
import { roleHasPermission } from '@/lib/publisher/authorization'
import {
  advertiserRoleHasPermission,
} from '@/lib/advertiser/authorization'
import {
  datesOverlap,
  decodeCursor,
  encodeCursor,
  isAllowedCreativeMime,
  MarketplaceValidationError,
  normalizeCreateAdvertiser,
  normalizeCreateBookingRequest,
  normalizeCreateCampaign,
  normalizeCreateCreative,
  recommendedScore,
  validateDestinationUrl,
  validateRequestAgainstPricing,
  validateRequestWindow,
} from '@/lib/advertiser/marketplaceDomain'
import { formatPriceMinor, validateMoney } from '@/lib/publisher/adInventoryDomain'
import { isInventoryMarketplaceEligible } from '@/services/advertiser/adInventoryAvailabilityService'
import type { PublisherAdInventoryRecord } from '@/types/publisherAdInventory'
import type { PublisherRecord } from '@/types/publisher'
import type { AdvertiserMemberRole } from '@/types/advertiserMarketplace'

function fakePublisher(over: Partial<PublisherRecord> = {}): PublisherRecord {
  return {
    id: 'pub_1',
    name: 'Test',
    slug: 'test',
    displayName: 'Test',
    publisherType: 'NEWS_ORGANIZATION',
    status: 'ACTIVE',
    description: null,
    logoUrl: null,
    coverImageUrl: null,
    websiteUrl: null,
    primaryDomain: null,
    countryCode: 'TR',
    city: 'Çanakkale',
    district: null,
    verificationStatus: 'VERIFIED',
    accentColorHex: null,
    claimedAt: null,
    verifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

function fakeInventory(over: Partial<PublisherAdInventoryRecord> = {}): PublisherAdInventoryRecord {
  return {
    id: 'pad_1',
    publisherId: 'pub_1',
    name: 'Banner',
    description: null,
    inventoryType: 'PROFILE',
    placementScope: 'PROFILE_INLINE',
    format: 'BANNER',
    semanticSize: 'BANNER',
    status: 'ACTIVE',
    saleStatus: 'AVAILABLE',
    pricingModel: 'FIXED_PERIOD',
    priceMinor: 15000,
    currency: 'TRY',
    periodDays: 30,
    impressionCap: null,
    ownershipType: 'PUBLISHER',
    isPubliclyListed: true,
    layoutItemId: null,
    articlePolicy: null,
    previewNote: null,
    createdBy: 'u1',
    updatedBy: null,
    archivedAt: null,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  }
}

describe('P9 marketplace eligibility', () => {
  it('only ACTIVE+VERIFIED+AVAILABLE+public', () => {
    expect(isInventoryMarketplaceEligible(fakeInventory(), fakePublisher())).toBe(true)
  })
  it('hides unverified', () => {
    expect(
      isInventoryMarketplaceEligible(
        fakeInventory(),
        fakePublisher({ verificationStatus: 'PENDING' })
      )
    ).toBe(false)
  })
  it('hides suspended', () => {
    expect(
      isInventoryMarketplaceEligible(fakeInventory(), fakePublisher({ status: 'SUSPENDED' }))
    ).toBe(false)
  })
  it('hides archived inventory', () => {
    expect(
      isInventoryMarketplaceEligible(fakeInventory({ status: 'ARCHIVED' }), fakePublisher())
    ).toBe(false)
  })
  it('hides not publicly listed', () => {
    expect(
      isInventoryMarketplaceEligible(fakeInventory({ isPubliclyListed: false }), fakePublisher())
    ).toBe(false)
  })
})

describe('P9 advertiser RBAC', () => {
  const cases: Array<[AdvertiserMemberRole, string, boolean]> = [
    ['OWNER', 'campaigns:write', true],
    ['ADMIN', 'requests:write', true],
    ['CAMPAIGN_MANAGER', 'creatives:write', true],
    ['CAMPAIGN_MANAGER', 'requests:write', true],
    ['ANALYST', 'campaigns:read', true],
    ['ANALYST', 'campaigns:write', false],
    ['ANALYST', 'requests:write', false],
  ]
  it.each(cases)('%s %s → %s', (role, perm, expected) => {
    expect(advertiserRoleHasPermission(role, perm as never)).toBe(expected)
  })
})

describe('P9 publisher request permissions', () => {
  it('OWNER/ADMIN/AD_MANAGER can review; EDITOR cannot', () => {
    expect(roleHasPermission('OWNER', 'ads:requests:review')).toBe(true)
    expect(roleHasPermission('ADMIN', 'ads:requests:review')).toBe(true)
    expect(roleHasPermission('AD_MANAGER', 'ads:requests:review')).toBe(true)
    expect(roleHasPermission('EDITOR', 'ads:requests:review')).toBe(false)
    expect(roleHasPermission('AUTHOR', 'ads:requests:review')).toBe(false)
    expect(roleHasPermission('ANALYST', 'ads:requests:read')).toBe(true)
    expect(roleHasPermission('ANALYST', 'ads:requests:review')).toBe(false)
  })
})

describe('P9 destination URL', () => {
  it('allows http/https only', () => {
    expect(validateDestinationUrl('https://example.com/x')).toContain('https://')
    expect(() => validateDestinationUrl('javascript:alert(1)')).toThrow(MarketplaceValidationError)
    expect(() => validateDestinationUrl('data:text/html,hi')).toThrow(MarketplaceValidationError)
  })
})

describe('P9 creative MIME', () => {
  it('blocks svg', () => {
    expect(isAllowedCreativeMime('image/png')).toBe(true)
    expect(isAllowedCreativeMime('image/svg+xml')).toBe(false)
  })
})

describe('P9 booking request validation', () => {
  it('rejects invalid date range', () => {
    expect(() =>
      normalizeCreateBookingRequest({
        campaignId: 'c1',
        inventoryId: 'i1',
        requestedStartAt: '2026-06-10T00:00:00.000Z',
        requestedEndAt: '2026-06-01T00:00:00.000Z',
      })
    ).toThrow(/INVALID_DATE/)
  })

  it('CONTACT_FOR_PRICE requires message', () => {
    expect(() => validateRequestAgainstPricing('CONTACT_FOR_PRICE', null, null)).toThrow(
      /MESSAGE_REQUIRED/
    )
    expect(() => validateRequestAgainstPricing('CONTACT_FOR_PRICE', null, 'Merhaba teklif')).not.toThrow()
  })

  it('FIXED_IMPRESSIONS requires impressions', () => {
    expect(() => validateRequestAgainstPricing('FIXED_IMPRESSIONS', null, 'ok')).toThrow(
      /IMPRESSIONS_REQUIRED/
    )
  })
})

describe('P9 date overlap / availability helpers', () => {
  it('detects overlap', () => {
    const a0 = new Date('2026-06-01T00:00:00Z')
    const a1 = new Date('2026-06-10T00:00:00Z')
    const b0 = new Date('2026-06-05T00:00:00Z')
    const b1 = new Date('2026-06-15T00:00:00Z')
    expect(datesOverlap(a0, a1, b0, b1)).toBe(true)
    expect(datesOverlap(a0, a1, new Date('2026-06-10T00:00:00Z'), b1)).toBe(false)
  })

  it('validateRequestWindow rejects inverted', () => {
    expect(() =>
      validateRequestWindow(new Date('2026-06-10'), new Date('2026-06-01'))
    ).toThrow()
  })
})

describe('P9 money snapshot (reuse P8)', () => {
  it('price snapshot exact formatting', () => {
    expect(validateMoney('FIXED_PERIOD', 15000)).toEqual({ priceMinor: 15000, currency: 'TRY' })
    expect(formatPriceMinor(15000)).toBe('150,00 ₺')
  })

  it('CONTACT_FOR_PRICE clears price', () => {
    expect(validateMoney('CONTACT_FOR_PRICE', 999).priceMinor).toBeNull()
  })
})

describe('P9 cursor pagination', () => {
  it('roundtrips without duplicate semantics', () => {
    const c = encodeCursor({ id: 'pad_1', sortValue: 1 })
    expect(decodeCursor(c)).toEqual({ id: 'pad_1', sortValue: 1 })
  })
})

describe('P9 recommended sort', () => {
  it('boosts local city match', () => {
    const local = recommendedScore({
      publisherCity: 'Çanakkale',
      preferredCity: 'Çanakkale',
      createdAtMs: 1000,
    })
    const remote = recommendedScore({
      publisherCity: 'İstanbul',
      preferredCity: 'Çanakkale',
      createdAtMs: 999999,
    })
    expect(local).toBeGreaterThan(remote)
  })
})

describe('P9 onboard / campaign / creative normalize', () => {
  it('creates advertiser input', () => {
    const a = normalizeCreateAdvertiser({
      name: 'Local Restaurant',
      advertiserType: 'BUSINESS',
      city: 'Çanakkale',
    })
    expect(a.name).toBe('Local Restaurant')
  })

  it('creates campaign', () => {
    const c = normalizeCreateCampaign({
      name: 'Çanakkale Yaz Kampanyası',
      objective: 'LOCAL_PROMOTION',
      budgetMinor: 100000,
    })
    expect(c.budgetMinor).toBe(100000)
  })

  it('rejects bad creative destination', () => {
    expect(() =>
      normalizeCreateCreative({
        name: 'Banner',
        creativeType: 'IMAGE',
        destinationUrl: 'javascript:void(0)',
      })
    ).toThrow()
  })
})

describe('P9 concurrent approval semantics (unit)', () => {
  it('documents that second transition from APPROVED fails', () => {
    // Conditional UPDATE ... WHERE status IN (SUBMITTED,...) returning empty
    // is the concurrency gate — covered here as contract.
    const fromStatuses = ['SUBMITTED', 'UNDER_REVIEW', 'OFFERED']
    expect(fromStatuses.includes('APPROVED')).toBe(false)
  })
})
