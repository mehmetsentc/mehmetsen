import {
  AD_FORMATS,
  AD_INVENTORY_TYPES,
  AD_PLACEMENT_SCOPES,
  AD_PRICING_MODELS,
  AD_SALE_STATUSES,
  AD_SEMANTIC_SIZES,
  ARTICLE_AD_POLICIES,
  type AdFormat,
  type AdInventoryCreateInput,
  type AdInventoryType,
  type AdInventoryUpdateInput,
  type AdPlacementScope,
  type AdPricingModel,
  type AdSaleStatus,
  type AdSemanticSize,
  type ArticleAdPlacementPolicy,
} from '@/types/publisherAdInventory'

export class AdInventoryValidationError extends Error {
  constructor(
    message: string,
    readonly code: string = 'VALIDATION'
  ) {
    super(message)
    this.name = 'AdInventoryValidationError'
  }
}

const DEFAULT_CURRENCY = 'TRY'

export function isAdInventoryType(v: unknown): v is AdInventoryType {
  return typeof v === 'string' && (AD_INVENTORY_TYPES as string[]).includes(v)
}

export function isAdPlacementScope(v: unknown): v is AdPlacementScope {
  return typeof v === 'string' && (AD_PLACEMENT_SCOPES as string[]).includes(v)
}

export function isAdFormat(v: unknown): v is AdFormat {
  return typeof v === 'string' && (AD_FORMATS as string[]).includes(v)
}

export function isAdSaleStatus(v: unknown): v is AdSaleStatus {
  return typeof v === 'string' && (AD_SALE_STATUSES as string[]).includes(v)
}

export function isAdPricingModel(v: unknown): v is AdPricingModel {
  return typeof v === 'string' && (AD_PRICING_MODELS as string[]).includes(v)
}

export function isAdSemanticSize(v: unknown): v is AdSemanticSize {
  return typeof v === 'string' && (AD_SEMANTIC_SIZES as string[]).includes(v)
}

export function isArticleAdPolicy(v: unknown): v is ArticleAdPlacementPolicy {
  return typeof v === 'string' && (ARTICLE_AD_POLICIES as string[]).includes(v)
}

/** Money: integer kuruş ≥ 0. CONTACT_FOR_PRICE allows null. */
export function validateMoney(
  pricingModel: AdPricingModel,
  priceMinor: number | null | undefined,
  currency?: string | null
): { priceMinor: number | null; currency: string } {
  const cur = (currency?.trim().toUpperCase() || DEFAULT_CURRENCY).slice(0, 3)
  if (cur !== 'TRY' && cur.length !== 3) {
    throw new AdInventoryValidationError('INVALID_CURRENCY', 'INVALID_CURRENCY')
  }
  if (pricingModel === 'CONTACT_FOR_PRICE') {
    return { priceMinor: null, currency: cur }
  }
  if (priceMinor == null || !Number.isInteger(priceMinor) || priceMinor < 0) {
    throw new AdInventoryValidationError('INVALID_PRICE_MINOR', 'INVALID_PRICE_MINOR')
  }
  if (priceMinor > 9_999_999_999) {
    throw new AdInventoryValidationError('PRICE_TOO_LARGE', 'PRICE_TOO_LARGE')
  }
  return { priceMinor, currency: cur }
}

export function defaultSemanticSize(format: AdFormat): AdSemanticSize {
  switch (format) {
    case 'BANNER':
      return 'BANNER'
    case 'NATIVE_CARD':
    case 'SPONSORED_CARD':
      return 'NATIVE'
    case 'RESPONSIVE_DISPLAY':
      return 'WIDE'
    default:
      return 'STANDARD'
  }
}

export function scopeMatchesType(type: AdInventoryType, scope: AdPlacementScope): boolean {
  if (type === 'CUSTOM' || scope === 'CUSTOM') return true
  if (type === 'PROFILE') return scope.startsWith('PROFILE_')
  if (type === 'ARTICLE') return scope.startsWith('ARTICLE_')
  if (type === 'SECTION') return scope.startsWith('SECTION_')
  if (type === 'FEED') return scope.startsWith('FEED_')
  return false
}

export function normalizeCreateInput(raw: AdInventoryCreateInput): AdInventoryCreateInput {
  const name = raw.name?.trim()
  if (!name || name.length < 2 || name.length > 120) {
    throw new AdInventoryValidationError('INVALID_NAME', 'INVALID_NAME')
  }
  if (!isAdInventoryType(raw.inventoryType)) {
    throw new AdInventoryValidationError('INVALID_INVENTORY_TYPE', 'INVALID_INVENTORY_TYPE')
  }
  if (!isAdPlacementScope(raw.placementScope)) {
    throw new AdInventoryValidationError('INVALID_PLACEMENT_SCOPE', 'INVALID_PLACEMENT_SCOPE')
  }
  if (!scopeMatchesType(raw.inventoryType, raw.placementScope)) {
    throw new AdInventoryValidationError('SCOPE_TYPE_MISMATCH', 'SCOPE_TYPE_MISMATCH')
  }
  if (!isAdFormat(raw.format)) {
    throw new AdInventoryValidationError('INVALID_FORMAT', 'INVALID_FORMAT')
  }
  if (!isAdPricingModel(raw.pricingModel)) {
    throw new AdInventoryValidationError('INVALID_PRICING_MODEL', 'INVALID_PRICING_MODEL')
  }
  const money = validateMoney(raw.pricingModel, raw.priceMinor, raw.currency)
  const semanticSize =
    raw.semanticSize && isAdSemanticSize(raw.semanticSize)
      ? raw.semanticSize
      : defaultSemanticSize(raw.format)

  let articlePolicy: ArticleAdPlacementPolicy | null = raw.articlePolicy ?? null
  if (raw.inventoryType === 'ARTICLE') {
    if (raw.placementScope === 'ARTICLE_BEFORE_BODY') articlePolicy = 'BEFORE_BODY'
    else if (raw.placementScope === 'ARTICLE_MID_BODY') articlePolicy = 'MID_BODY'
    else if (raw.placementScope === 'ARTICLE_AFTER_BODY') articlePolicy = 'AFTER_BODY'
    if (articlePolicy && !isArticleAdPolicy(articlePolicy)) {
      throw new AdInventoryValidationError('INVALID_ARTICLE_POLICY', 'INVALID_ARTICLE_POLICY')
    }
  } else {
    articlePolicy = null
  }

  const saleStatus: AdSaleStatus =
    raw.saleStatus && isAdSaleStatus(raw.saleStatus) ? raw.saleStatus : 'NOT_FOR_SALE'

  if (raw.pricingModel === 'FIXED_PERIOD') {
    if (raw.periodDays != null && (!Number.isInteger(raw.periodDays) || raw.periodDays < 1)) {
      throw new AdInventoryValidationError('INVALID_PERIOD_DAYS', 'INVALID_PERIOD_DAYS')
    }
  }
  if (raw.pricingModel === 'FIXED_IMPRESSIONS') {
    if (
      raw.impressionCap != null &&
      (!Number.isInteger(raw.impressionCap) || raw.impressionCap < 1)
    ) {
      throw new AdInventoryValidationError('INVALID_IMPRESSION_CAP', 'INVALID_IMPRESSION_CAP')
    }
  }

  return {
    name,
    description: raw.description?.trim() || null,
    inventoryType: raw.inventoryType,
    placementScope: raw.placementScope,
    format: raw.format,
    semanticSize,
    pricingModel: raw.pricingModel,
    priceMinor: money.priceMinor,
    currency: money.currency,
    periodDays: raw.pricingModel === 'FIXED_PERIOD' ? raw.periodDays ?? 30 : null,
    impressionCap: raw.pricingModel === 'FIXED_IMPRESSIONS' ? raw.impressionCap ?? null : null,
    isPubliclyListed: Boolean(raw.isPubliclyListed),
    saleStatus,
    articlePolicy,
    previewNote: raw.previewNote?.trim() || null,
    layoutItemId: raw.layoutItemId?.trim() || null,
  }
}

export function normalizeUpdateInput(raw: AdInventoryUpdateInput): AdInventoryUpdateInput {
  const out: AdInventoryUpdateInput = {}
  if (raw.name !== undefined) {
    const name = raw.name.trim()
    if (!name || name.length < 2 || name.length > 120) {
      throw new AdInventoryValidationError('INVALID_NAME', 'INVALID_NAME')
    }
    out.name = name
  }
  if (raw.description !== undefined) out.description = raw.description?.trim() || null
  if (raw.format !== undefined) {
    if (!isAdFormat(raw.format)) throw new AdInventoryValidationError('INVALID_FORMAT')
    out.format = raw.format
  }
  if (raw.semanticSize !== undefined) {
    if (!isAdSemanticSize(raw.semanticSize)) {
      throw new AdInventoryValidationError('INVALID_SEMANTIC_SIZE')
    }
    out.semanticSize = raw.semanticSize
  }
  if (raw.status !== undefined) {
    if (raw.status !== 'ACTIVE' && raw.status !== 'INACTIVE') {
      throw new AdInventoryValidationError('INVALID_STATUS')
    }
    out.status = raw.status
  }
  if (raw.saleStatus !== undefined) {
    if (!isAdSaleStatus(raw.saleStatus)) throw new AdInventoryValidationError('INVALID_SALE_STATUS')
    out.saleStatus = raw.saleStatus
  }
  if (raw.pricingModel !== undefined) {
    if (!isAdPricingModel(raw.pricingModel)) {
      throw new AdInventoryValidationError('INVALID_PRICING_MODEL')
    }
    out.pricingModel = raw.pricingModel
  }
  if (raw.pricingModel !== undefined || raw.priceMinor !== undefined || raw.currency !== undefined) {
    const model = raw.pricingModel ?? 'CONTACT_FOR_PRICE'
    // Caller must pass current model when only price changes — validated in service.
    if (raw.pricingModel) {
      const money = validateMoney(raw.pricingModel, raw.priceMinor, raw.currency)
      out.priceMinor = money.priceMinor
      out.currency = money.currency
    } else if (raw.priceMinor !== undefined || raw.currency !== undefined) {
      out.priceMinor = raw.priceMinor
      out.currency = raw.currency
    }
  }
  if (raw.periodDays !== undefined) out.periodDays = raw.periodDays
  if (raw.impressionCap !== undefined) out.impressionCap = raw.impressionCap
  if (raw.isPubliclyListed !== undefined) out.isPubliclyListed = Boolean(raw.isPubliclyListed)
  if (raw.articlePolicy !== undefined) {
    if (raw.articlePolicy != null && !isArticleAdPolicy(raw.articlePolicy)) {
      throw new AdInventoryValidationError('INVALID_ARTICLE_POLICY')
    }
    out.articlePolicy = raw.articlePolicy
  }
  if (raw.previewNote !== undefined) out.previewNote = raw.previewNote?.trim() || null
  if (raw.layoutItemId !== undefined) out.layoutItemId = raw.layoutItemId?.trim() || null
  return out
}

/** Format kuruş as TRY display (e.g. 15000 → "150,00 ₺"). */
export function formatPriceMinor(priceMinor: number | null, currency = 'TRY'): string | null {
  if (priceMinor == null) return null
  const major = priceMinor / 100
  return `${major.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency === 'TRY' ? '₺' : currency}`
}

/**
 * Deterministic mid-body insert index (~35% through blocks).
 * Returns null when fewer than 2 blocks.
 */
export function midBodyInsertIndex(blockCount: number): number | null {
  if (blockCount < 2) return null
  return Math.max(1, Math.min(blockCount - 1, Math.floor(blockCount * 0.35)))
}

/** Feed inventory contract stub — NO Smart Feed injection. */
export interface FeedAdInventoryContract {
  inventoryId: string
  publisherId: string
  placementScope: 'FEED_INLINE'
  saleStatus: AdSaleStatus
  isPubliclyListed: boolean
}

export function toFeedContract(row: {
  id: string
  publisherId: string
  saleStatus: AdSaleStatus
  isPubliclyListed: boolean
}): FeedAdInventoryContract {
  return {
    inventoryId: row.id,
    publisherId: row.publisherId,
    placementScope: 'FEED_INLINE',
    saleStatus: row.saleStatus,
    isPubliclyListed: row.isPubliclyListed,
  }
}
