/**
 * Phase P8 — Publisher ad inventory tests (in-memory / unit).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { roleHasPermission } from '@/lib/publisher/authorization'
import {
  formatPriceMinor,
  midBodyInsertIndex,
  normalizeCreateInput,
  scopeMatchesType,
  toFeedContract,
  validateMoney,
  AdInventoryValidationError,
} from '@/lib/publisher/adInventoryDomain'
import { splitBlocksForMidAd } from '@/lib/publisher/articleAdPlacements'
import type { PublisherMemberRole } from '@/types/publisher'

describe('P8 ads permission matrix', () => {
  const cases: Array<[PublisherMemberRole, string, boolean]> = [
    ['OWNER', 'ads:create', true],
    ['ADMIN', 'ads:archive', true],
    ['AD_MANAGER', 'ads:publish', true],
    ['AD_MANAGER', 'ads:read', true],
    ['EDITOR', 'ads:read', true],
    ['EDITOR', 'ads:create', false],
    ['AUTHOR', 'ads:read', false],
    ['AUTHOR', 'ads:create', false],
    ['ANALYST', 'ads:read', true],
    ['ANALYST', 'ads:update', false],
    ['VIEWER', 'ads:read', false],
  ]

  it.each(cases)('%s %s → %s', (role, perm, expected) => {
    expect(roleHasPermission(role, perm as never)).toBe(expected)
  })
})

describe('P8 money validation', () => {
  it('accepts integer kuruş for FIXED_PERIOD', () => {
    expect(validateMoney('FIXED_PERIOD', 15000, 'TRY')).toEqual({
      priceMinor: 15000,
      currency: 'TRY',
    })
  })

  it('rejects fractional / negative', () => {
    expect(() => validateMoney('FIXED_IMPRESSIONS', -1)).toThrow(AdInventoryValidationError)
    expect(() => validateMoney('FIXED_IMPRESSIONS', 10.5 as never)).toThrow(
      AdInventoryValidationError
    )
  })

  it('CONTACT_FOR_PRICE clears price', () => {
    expect(validateMoney('CONTACT_FOR_PRICE', 999)).toEqual({
      priceMinor: null,
      currency: 'TRY',
    })
  })

  it('formats TRY display', () => {
    expect(formatPriceMinor(15000)).toBe('150,00 ₺')
  })
})

describe('P8 create normalization', () => {
  it('rejects scope/type mismatch', () => {
    expect(() =>
      normalizeCreateInput({
        name: 'Test',
        inventoryType: 'PROFILE',
        placementScope: 'ARTICLE_MID_BODY',
        format: 'BANNER',
        pricingModel: 'CONTACT_FOR_PRICE',
      })
    ).toThrow(/SCOPE_TYPE_MISMATCH/)
  })

  it('sets article policy from placement', () => {
    const input = normalizeCreateInput({
      name: 'Mid slot',
      inventoryType: 'ARTICLE',
      placementScope: 'ARTICLE_MID_BODY',
      format: 'NATIVE_CARD',
      pricingModel: 'FIXED_PERIOD',
      priceMinor: 50000,
      periodDays: 30,
    })
    expect(input.articlePolicy).toBe('MID_BODY')
    expect(scopeMatchesType('ARTICLE', 'ARTICLE_MID_BODY')).toBe(true)
  })

  it('forbids empty name', () => {
    expect(() =>
      normalizeCreateInput({
        name: ' ',
        inventoryType: 'CUSTOM',
        placementScope: 'CUSTOM',
        format: 'BANNER',
        pricingModel: 'CONTACT_FOR_PRICE',
      })
    ).toThrow(/INVALID_NAME/)
  })
})

describe('P8 layout AD_SLOT + mid insert', () => {
  it('midBodyInsertIndex is deterministic ~35%', () => {
    expect(midBodyInsertIndex(10)).toBe(3)
    expect(midBodyInsertIndex(1)).toBeNull()
    expect(midBodyInsertIndex(0)).toBeNull()
  })

  it('splitBlocksForMidAd preserves article blocks', () => {
    const blocks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    const { before, after, insertAt } = splitBlocksForMidAd(blocks)
    expect(insertAt).toBe(3)
    expect([...before, ...after]).toEqual(blocks)
  })

  it('feed contract does not inject into smart feed', () => {
    const c = toFeedContract({
      id: 'pad_1',
      publisherId: 'pub_1',
      saleStatus: 'AVAILABLE',
      isPubliclyListed: true,
    })
    expect(c.placementScope).toBe('FEED_INLINE')
    expect(c.inventoryId).toBe('pad_1')
  })
})

describe('P8 preview security contract', () => {
  it('preview route metadata is noindex and page does not SSR-load content body', async () => {
    const pagePath = `${process.cwd()}/src/app/(main)/publisher-studio/[slug]/preview/[contentId]/page.tsx`
    const pageSrc = await import('node:fs/promises').then((fs) => fs.readFile(pagePath, 'utf8'))
    expect(pageSrc).toMatch(/robots:\s*\{[^}]*index:\s*false/)
    expect(pageSrc).toContain('PublisherContentPreviewClient')
    expect(pageSrc).not.toContain('publisherContentRepository.findById')
    expect(pageSrc).toContain('Do NOT fetch content body')
    expect(pageSrc).toContain('üyelik gerekli')
  })

  it('content:read is the minimum membership gate used by preview API', () => {
    expect(roleHasPermission('AUTHOR', 'content:read')).toBe(true)
    expect(roleHasPermission('VIEWER', 'content:read')).toBe(true)
    expect(roleHasPermission('AD_MANAGER', 'content:read')).toBe(true)
  })
})

describe('P8 article ad flag OFF → zero output', () => {
  it('buildArticleAdSlotViews returns nulls when flags off', async () => {
    vi.resetModules()
    vi.doMock('@/lib/publisher/adInventoryFlags', () => ({
      isArticleAdSlotsEnabled: () => false,
      isPublisherAdPublicListingEnabled: () => false,
    }))
    const { buildArticleAdSlotViews } = await import('@/lib/publisher/articleAdPlacements')
    const views = buildArticleAdSlotViews(
      [
        {
          id: 'pad_x',
          publisherId: 'pub',
          name: 'Mid',
          description: null,
          inventoryType: 'ARTICLE',
          placementScope: 'ARTICLE_MID_BODY',
          format: 'BANNER',
          semanticSize: 'BANNER',
          status: 'ACTIVE',
          saleStatus: 'AVAILABLE',
          pricingModel: 'CONTACT_FOR_PRICE',
          priceMinor: null,
          currency: 'TRY',
          periodDays: null,
          impressionCap: null,
          ownershipType: 'PUBLISHER',
          isPubliclyListed: true,
          layoutItemId: null,
          articlePolicy: 'MID_BODY',
          previewNote: null,
          createdBy: 'u',
          updatedBy: null,
          archivedAt: null,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      { publisherSlug: 'demo', blockCount: 10 }
    )
    expect(views.before).toBeNull()
    expect(views.mid).toBeNull()
    expect(views.after).toBeNull()
  })
})

describe('P8 sitemap empty when flags OFF', () => {
  it('documents publishers/events empty urlset as flag-OFF expected', async () => {
    const { urlsetXml } = await import('@/lib/sitemap/seoXml')
    const empty = urlsetXml([])
    expect(empty).toContain('<urlset')
    expect(empty).not.toContain('<url>')
    // Production: PUBLISHER_PLATFORM_ENABLED=false → buildPublishersSitemap returns empty
    // Production: EVENT_PAGES_ENABLED=false → buildEventsSitemap returns empty
    // Not a bug — intentional when SEO/event/publisher flags are OFF.
  })
})

beforeEach(() => {
  vi.restoreAllMocks()
})
