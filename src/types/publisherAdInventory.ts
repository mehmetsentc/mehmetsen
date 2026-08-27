/** Publisher advertising inventory — Phase P8 (inventory/slot/product-offer only). */

export type AdInventoryType = 'PROFILE' | 'ARTICLE' | 'SECTION' | 'FEED' | 'CUSTOM'

export type AdPlacementScope =
  | 'PROFILE_HERO'
  | 'PROFILE_SIDEBAR'
  | 'PROFILE_INLINE'
  | 'PROFILE_FOOTER'
  | 'ARTICLE_BEFORE_BODY'
  | 'ARTICLE_MID_BODY'
  | 'ARTICLE_AFTER_BODY'
  | 'VIDEO_PRE_ROLL'
  | 'SECTION_TOP'
  | 'SECTION_INLINE'
  | 'FEED_INLINE'
  | 'CUSTOM'

export type AdFormat = 'BANNER' | 'NATIVE_CARD' | 'RESPONSIVE_DISPLAY' | 'SPONSORED_CARD'

export type AdInventoryStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'

export type AdSaleStatus = 'NOT_FOR_SALE' | 'AVAILABLE' | 'RESERVED' | 'SOLD'

export type AdPricingModel = 'FIXED_PERIOD' | 'FIXED_IMPRESSIONS' | 'CONTACT_FOR_PRICE'

export type AdOwnershipType = 'PUBLISHER' | 'PLATFORM'

export type AdSemanticSize = 'BANNER' | 'WIDE' | 'STANDARD' | 'NATIVE' | 'FULL'

export type ArticleAdPlacementPolicy = 'BEFORE_BODY' | 'MID_BODY' | 'AFTER_BODY'

export interface PublisherAdInventoryRecord {
  id: string
  publisherId: string
  name: string
  description: string | null
  inventoryType: AdInventoryType
  placementScope: AdPlacementScope
  format: AdFormat
  semanticSize: AdSemanticSize
  status: AdInventoryStatus
  saleStatus: AdSaleStatus
  pricingModel: AdPricingModel
  /** Minor units (kuruş). Null when CONTACT_FOR_PRICE. */
  priceMinor: number | null
  currency: string
  periodDays: number | null
  impressionCap: number | null
  ownershipType: AdOwnershipType
  isPubliclyListed: boolean
  layoutItemId: string | null
  articlePolicy: ArticleAdPlacementPolicy | null
  previewNote: string | null
  createdBy: string
  updatedBy: string | null
  archivedAt: Date | null
  version: number
  createdAt: Date
  updatedAt: Date
}

export interface PublisherAdInventoryAuditRecord {
  id: string
  inventoryId: string
  publisherId: string
  eventType: string
  actorUserId: string | null
  payload: Record<string, unknown> | null
  createdAt: Date
}

export interface AdInventoryCreateInput {
  name: string
  description?: string | null
  inventoryType: AdInventoryType
  placementScope: AdPlacementScope
  format: AdFormat
  semanticSize?: AdSemanticSize
  pricingModel: AdPricingModel
  priceMinor?: number | null
  currency?: string
  periodDays?: number | null
  impressionCap?: number | null
  isPubliclyListed?: boolean
  saleStatus?: AdSaleStatus
  articlePolicy?: ArticleAdPlacementPolicy | null
  previewNote?: string | null
  layoutItemId?: string | null
}

export interface AdInventoryUpdateInput {
  name?: string
  description?: string | null
  format?: AdFormat
  semanticSize?: AdSemanticSize
  status?: Exclude<AdInventoryStatus, 'ARCHIVED'>
  saleStatus?: AdSaleStatus
  pricingModel?: AdPricingModel
  priceMinor?: number | null
  currency?: string
  periodDays?: number | null
  impressionCap?: number | null
  isPubliclyListed?: boolean
  articlePolicy?: ArticleAdPlacementPolicy | null
  previewNote?: string | null
  layoutItemId?: string | null
}

export interface AdInventoryDashboardCounts {
  total: number
  active: number
  available: number
  reserved: number
  sold: number
  archived: number
  publiclyListed: number
}

export const AD_INVENTORY_TYPES: AdInventoryType[] = [
  'PROFILE',
  'ARTICLE',
  'SECTION',
  'FEED',
  'CUSTOM',
]

export const AD_PLACEMENT_SCOPES: AdPlacementScope[] = [
  'PROFILE_HERO',
  'PROFILE_SIDEBAR',
  'PROFILE_INLINE',
  'PROFILE_FOOTER',
  'ARTICLE_BEFORE_BODY',
  'ARTICLE_MID_BODY',
  'ARTICLE_AFTER_BODY',
  'VIDEO_PRE_ROLL',
  'SECTION_TOP',
  'SECTION_INLINE',
  'FEED_INLINE',
  'CUSTOM',
]

export const AD_FORMATS: AdFormat[] = [
  'BANNER',
  'NATIVE_CARD',
  'RESPONSIVE_DISPLAY',
  'SPONSORED_CARD',
]

export const AD_SALE_STATUSES: AdSaleStatus[] = [
  'NOT_FOR_SALE',
  'AVAILABLE',
  'RESERVED',
  'SOLD',
]

export const AD_PRICING_MODELS: AdPricingModel[] = [
  'FIXED_PERIOD',
  'FIXED_IMPRESSIONS',
  'CONTACT_FOR_PRICE',
]

export const AD_SEMANTIC_SIZES: AdSemanticSize[] = [
  'BANNER',
  'WIDE',
  'STANDARD',
  'NATIVE',
  'FULL',
]

export const ARTICLE_AD_POLICIES: ArticleAdPlacementPolicy[] = [
  'BEFORE_BODY',
  'MID_BODY',
  'AFTER_BODY',
]

export const AD_INVENTORY_TYPE_LABELS: Record<AdInventoryType, string> = {
  PROFILE: 'Profil',
  ARTICLE: 'Makale',
  SECTION: 'Bölüm',
  FEED: 'Akış',
  CUSTOM: 'Özel',
}

export const AD_FORMAT_LABELS: Record<AdFormat, string> = {
  BANNER: 'Banner',
  NATIVE_CARD: 'Native Kart',
  RESPONSIVE_DISPLAY: 'Responsive Display',
  SPONSORED_CARD: 'Sponsorlu Kart',
}

export const AD_SALE_STATUS_LABELS: Record<AdSaleStatus, string> = {
  NOT_FOR_SALE: 'Satışta Değil',
  AVAILABLE: 'Satışa Açık',
  RESERVED: 'Rezerve',
  SOLD: 'Satıldı',
}

export const AD_PRICING_MODEL_LABELS: Record<AdPricingModel, string> = {
  FIXED_PERIOD: 'Sabit dönem',
  FIXED_IMPRESSIONS: 'Sabit gösterim',
  CONTACT_FOR_PRICE: 'Fiyat için iletişime geçin',
}
