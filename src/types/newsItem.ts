/** Lightweight homepage feed model mapped from Firestore `news` documents. */
export type NewsItem = {
  id: string
  slug: string
  title: string
  description?: string
  content?: string
  imageUrl?: string
  videoUrl?: string
  category?: string
  source?: string
  author?: string
  url?: string
  city?: string
  locationCity?: string
  province?: string
  eventDate?: string
  createdAt?: string
  publishedAt?: string
  views?: number
  likesCount?: number
  commentsCount?: number
  featured?: boolean
  breaking?: boolean
}

export type HomeCategorySlug =
  | 'gundem'
  | 'yerel-haber'
  | 'siyaset'
  | 'spor'
  | 'magazin'
  | 'ekonomi'
  | 'dunya'
  | 'teknoloji'
  | 'saglik'
  | 'yasam'
  | 'otomobil'
  | 'gastronomi'
  | 'kultur'
  | 'turizm'
  | 'gezi'
  | 'asayis'

export const HOME_CATEGORY_RAILS: HomeCategorySlug[] = [
  'gundem',
  'yerel-haber',
  'siyaset',
  'spor',
  'magazin',
  'ekonomi',
  'dunya',
  'teknoloji',
  'saglik',
  'yasam',
  'otomobil',
  'gastronomi',
  'kultur',
  'turizm',
  'gezi',
  'asayis',
]

/** Ana sayfa kategori bölümleri — Firestore'dan ayrı sorgulanır. */
export const FEED_PRIORITY_RAILS: HomeCategorySlug[] = [
  'gundem',
  'spor',
  'ekonomi',
  'teknoloji',
  'dunya',
  'saglik',
  'kultur',
  'turizm',
  'gezi',
]

export interface HomeFeedInitialData {
  breaking: NewsItem[]
  featured: NewsItem[]
  /** Hot-aware sıralanmış akış (son 72 saat hot skoru ile, eski haberler kronolojik). */
  latest: NewsItem[]
  /** "Şu an trend" rail — kısa pencerede en çok ilgi gören haberler (yatay şerit). */
  trending: NewsItem[]
  /** Trend sekmesi — hot skoruna göre sıralanmış tam akış. */
  trendFeed: NewsItem[]
  /** "Gözden Kaçmasın" — all-time en çok okunan haberler. */
  mostRead: NewsItem[]
  categoryRails: Partial<Record<HomeCategorySlug, NewsItem[]>>
}
