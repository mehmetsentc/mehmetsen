export type AdBannerFormat = 'image' | 'video' | 'html'

export type AdBannerSize = 'leaderboard' | 'large' | 'skyscraper'

export type AdBannerPage = 'home' | 'category' | 'all_categories'

/** Phase 2: local (il/ilçe) ads by scoped editors need il genel editörü approval. */
export type AdBannerStatus = 'pending' | 'approved' | 'rejected'

export interface AdBanner {
  id: string
  name: string
  slotId: string
  page: AdBannerPage
  categoryId?: string | null
  position: 'top' | 'mid' | 'bottom' | 'skyscraper'
  format: AdBannerFormat
  size: AdBannerSize
  imageUrl?: string | null
  imageUrlLight?: string | null
  imageUrlDark?: string | null
  videoUrl?: string | null
  htmlContent?: string | null
  clickUrl?: string | null
  altText?: string | null
  active: boolean
  priority: number
  startsAt?: string | null
  endsAt?: string | null
  createdAt: string
  updatedAt: string
  createdBy?: string | null
  /** Phase 2 geo targeting: null = national (legacy, shown everywhere). */
  provinceSlug?: string | null
  /** Only with provinceSlug; null = whole province. */
  districtSlug?: string | null
  /** Missing on legacy docs = approved. */
  status?: AdBannerStatus
  submittedByUid?: string | null
  reviewedBy?: string | null
}

export type AdBannerInput = Omit<AdBanner, 'id' | 'createdAt' | 'updatedAt'>

export interface AdBannerPublic {
  id: string
  slotId: string
  format: AdBannerFormat
  size: AdBannerSize
  imageUrl?: string | null
  imageUrlLight?: string | null
  imageUrlDark?: string | null
  videoUrl?: string | null
  htmlContent?: string | null
  clickUrl?: string | null
  altText?: string | null
}
