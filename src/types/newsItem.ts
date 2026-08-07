/** Lightweight homepage feed model mapped from Firestore `news` documents. */
export type NewsItem = {
  id: string
  slug: string
  title: string
  description?: string
  content?: string
  /** Precomputed on the server for list payloads (content is stripped). */
  readingMinutes?: number
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
  /** ISO — set when editor toggles Öne Çıkan; drives featured sort priority. */
  featuredAt?: string
  breaking?: boolean
  /** column/analysis excluded from breaking stripe */
  articleFormat?: 'standard' | 'column' | 'analysis'
  /** SEO-optimized short title (55-65 chars) — used as carousel manşet when available */
  seoTitle?: string
}

export type HomeCategorySlug =
  | 'gundem'
  | 'yerel-haber'
  | 'siyaset'
  | 'spor'
  | 'magazin'
  | 'ekonomi'
  | 'dunya'
  | 'kibris-haberleri'
  | 'teknoloji'
  | 'bilim'
  | 'egitim'
  | 'cevre-iklim'
  | 'oyun-espor'
  | 'din-inanc'
  | 'saglik'
  | 'yasam'
  | 'otomobil'
  | 'gastronomi'
  | 'kultur'
  | 'turizm'
  | 'gezi'
  | 'asayis'
  | 'tarih'

export const HOME_CATEGORY_RAILS: HomeCategorySlug[] = [
  'gundem',
  'yerel-haber',
  'siyaset',
  'spor',
  'magazin',
  'ekonomi',
  'dunya',
  'kibris-haberleri',
  'teknoloji',
  'bilim',
  'egitim',
  'cevre-iklim',
  'oyun-espor',
  'din-inanc',
  'saglik',
  'yasam',
  'otomobil',
  'gastronomi',
  'kultur',
  'turizm',
  'gezi',
  'asayis',
  'tarih',
]

/**
 * Mobil kaydırmalı kategori şeritleri — her kategoriden aynı sayıda en son haber.
 * Fetch: Firestore'dan çekilen üst sınır. Display: mobilde gösterilen kart sayısı.
 * Min: bundan az haber varsa şerit hiç render edilmez (tek kartlı boş şerit olmasın).
 */
export const HOME_CATEGORY_RAIL_FETCH = 5
export const HOME_CATEGORY_RAIL_DISPLAY = 5
export const HOME_CATEGORY_RAIL_MIN = 4

/**
 * Masaüstü hero/alt bölümler için Gündem'den ekstra haber gerekir.
 * Mobil şerit yine DISPLAY ile kesilir.
 */
export const HOME_CATEGORY_RAIL_GUNDEM_FETCH = 20

/** Masaüstü kategori grid’inde kart sayısı — her kategoride eşit. */
export const HOME_CATEGORY_DESKTOP_CARDS = 4

/**
 * SSR’da gömülecek kategori rayları — kalanlar istemci lazy API ile gelir.
 * Desktop: hero (gundem) + ilk kategori satırı. İkinci satır lazy.
 */
export const HOME_FEED_SSR_RAILS: HomeCategorySlug[] = [
  'gundem',
  'spor',
  'ekonomi',
  'teknoloji',
  'dunya',
]

/** Desktop ikinci kategori satırı — lazy fetch. */
export const HOME_FEED_DESKTOP_LAZY_RAILS: HomeCategorySlug[] = [
  'saglik',
  'kultur',
  'turizm',
  'gezi',
]

/** @deprecated Artık pool-first; geriye dönük importlar için tutuluyor. */
export const FEED_PRIORITY_RAILS: HomeCategorySlug[] = HOME_CATEGORY_RAILS

/** Ana sayfa Öne Çıkan — desktop grid.
 * Desktop: 1 lead + 2 yan + 8 alt (4+4) = 11 — alt satırda 3’lü kırık satır olmasın.
 */
export const HOME_FEATURED_LIMIT = 11

/** Mobil manşet carousel — ana sayfa + kategori (tek satır dot için max 10). */
export const FEATURED_CAROUSEL_LIMIT = 10

export interface HomeFeedInitialData {
  breaking: NewsItem[]
  /** CMS Öne Çıkan — kategori bağımsız, en fazla HOME_FEATURED_LIMIT. */
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
