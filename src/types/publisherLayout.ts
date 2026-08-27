/** Publisher layout engine — Phase P2 types. */

export type LayoutStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export type LayoutThemeKey = 'MODERN' | 'CLASSIC_NEWS' | 'VISUAL' | 'COMPACT'

export type LayoutSectionType = 'CUSTOM' | 'HERO' | 'LATEST' | 'FEATURED' | 'AD_ZONE'

export type LayoutContentMode = 'MANUAL' | 'AUTO'

export type LayoutItemSize =
  | 'HERO'
  | 'LEAD'
  | 'FEATURED'
  | 'STANDARD'
  | 'COMPACT'
  | 'WIDE'
  | 'FULL'
  | 'BANNER'
  | 'NATIVE'

export type LayoutItemType = 'ARTICLE' | 'AD_SLOT'

export interface LayoutAutoConfig extends Record<string, unknown> {
  sort?: 'newest' | 'oldest'
  limit?: number
  categorySlug?: string
}

export interface PublisherLayoutRecord {
  id: string
  publisherId: string
  name: string
  status: LayoutStatus
  themeKey: LayoutThemeKey
  version: number
  createdBy: string | null
  createdAt: Date
  updatedAt: Date
  publishedAt: Date | null
}

export interface PublisherLayoutSectionRecord {
  id: string
  layoutId: string
  title: string
  slug: string
  sectionType: LayoutSectionType
  position: number
  displayStyle: string
  isVisible: boolean
  contentMode: LayoutContentMode
  autoConfig: LayoutAutoConfig | null
  createdAt: Date
  updatedAt: Date
}

export interface PublisherLayoutItemRecord {
  id: string
  layoutId: string
  sectionId: string
  itemType: LayoutItemType
  contentId: string | null
  position: number
  size: LayoutItemSize
  span: number
  presentation: Record<string, unknown> | null
  createdAt: Date
  updatedAt: Date
}

export interface ResolvedLayoutArticle {
  id: string
  slug: string
  title: string
  summary: string | null
  thumbnailUrl: string | null
  categorySlug: string | null
  categoryName: string | null
  publishedAt: Date | null
  missing?: boolean
}

export interface ResolvedLayoutSection {
  section: PublisherLayoutSectionRecord
  items: Array<PublisherLayoutItemRecord & { article?: ResolvedLayoutArticle | null }>
}

export interface ResolvedPublisherLayout {
  layout: PublisherLayoutRecord
  sections: ResolvedLayoutSection[]
}

export interface LayoutDraftPayload {
  name?: string
  themeKey?: LayoutThemeKey
  sections?: Array<{
    id?: string
    title: string
    slug?: string
    sectionType?: LayoutSectionType
    position: number
    displayStyle?: string
    isVisible?: boolean
    contentMode?: LayoutContentMode
    autoConfig?: LayoutAutoConfig | null
    items?: Array<{
      id?: string
      itemType?: LayoutItemType
      contentId?: string | null
      position: number
      size?: LayoutItemSize
      span?: number
      presentation?: Record<string, unknown> | null
    }>
  }>
}

export const LAYOUT_THEME_LABELS: Record<LayoutThemeKey, string> = {
  MODERN: 'Modern',
  CLASSIC_NEWS: 'Klasik Haber',
  VISUAL: 'Görsel',
  COMPACT: 'Kompakt',
}

export const LAYOUT_ITEM_SIZE_SPAN: Record<LayoutItemSize, number> = {
  HERO: 12,
  LEAD: 8,
  FEATURED: 6,
  STANDARD: 4,
  COMPACT: 3,
  WIDE: 8,
  FULL: 12,
  BANNER: 12,
  NATIVE: 6,
}

export const VALID_LAYOUT_ITEM_SIZES = Object.keys(LAYOUT_ITEM_SIZE_SPAN) as LayoutItemSize[]

export function normalizeLayoutItemSize(size: string | undefined): LayoutItemSize {
  const upper = (size ?? 'STANDARD').toUpperCase() as LayoutItemSize
  if (VALID_LAYOUT_ITEM_SIZES.includes(upper)) return upper
  return 'STANDARD'
}

export function spanForSize(size: LayoutItemSize): number {
  return LAYOUT_ITEM_SIZE_SPAN[size]
}
