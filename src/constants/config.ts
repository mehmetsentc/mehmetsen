import { ROUTES } from '@/constants/routes'

// TODO: Implement in Phase 1
export const APP_CONFIG = {
  NAME: 'NaHaber',
  DESCRIPTION: 'Güncel haberleri takip et, paylaş ve tartış.',
  POSTS_PER_PAGE: 10,
  COMMENTS_PER_PAGE: 20,
  MAX_IMAGE_SIZE_MB: 2,
  MAX_VIDEO_SIZE_MB: 50,
  MAX_IMAGES_PER_POST: 5,
  ALLOWED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/webp'],
  ALLOWED_VIDEO_TYPES: ['video/mp4', 'video/webm'],
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  POST_TITLE_MAX_LENGTH: 150,
  POST_SUMMARY_MAX_LENGTH: 200,
} as const

export interface CategoryDef {
  id: string
  name: string
  slug: string
  iconName: string
  color: string
  /** Parent category id — defines a subcategory relationship */
  parentId?: string
  /**
   * When true, this subcategory's articles are ISOLATED — they appear only
   * on their own page and NOT in the parent's feed query.
   * The chip still shows on the parent page for navigation.
   */
  standalone?: boolean
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  // ── Ana kategoriler ─────────────────────────────────────────────────────────
  { id: 'trend',       name: 'Trending',    slug: 'trend',       iconName: 'flame',        color: '#FF6B35' },
  { id: 'gundem',      name: 'Gündem',      slug: 'gundem',      iconName: 'newspaper',    color: '#EF4444' },
  { id: 'yerel-haber', name: 'Yerel Haber', slug: 'yerel-haber', iconName: 'map-pin',      color: '#059669' },
  { id: 'siyaset',     name: 'Siyaset',     slug: 'siyaset',     iconName: 'landmark',     color: '#7C3AED' },
  { id: 'dunya',       name: 'Dünya',       slug: 'dunya',       iconName: 'globe',        color: '#6B7280' },
  { id: 'ekonomi',     name: 'Ekonomi',     slug: 'ekonomi',     iconName: 'trending-up',  color: '#F59E0B' },
  { id: 'borsa',       name: 'Borsa',       slug: 'borsa',       iconName: 'bar-chart-2',  color: '#22C55E', parentId: 'ekonomi', standalone: true },
  { id: 'kripto',      name: 'Kripto',      slug: 'kripto',      iconName: 'bitcoin',      color: '#F7931A', parentId: 'ekonomi', standalone: true },
  { id: 'teknoloji',   name: 'Teknoloji',   slug: 'teknoloji',   iconName: 'cpu',          color: '#3B82F6' },
  { id: 'saglik',      name: 'Sağlık',      slug: 'saglik',      iconName: 'heart',        color: '#EC4899' },
  { id: 'bilim',       name: 'Bilim',       slug: 'bilim',       iconName: 'flask',        color: '#14B8A6' },
  { id: 'magazin',     name: 'Magazin',     slug: 'magazin',     iconName: 'star',         color: '#F472B6' },

  // ── Spor + alt kategoriler ──────────────────────────────────────────────────
  { id: 'spor',              name: 'Spor',             slug: 'spor',              iconName: 'trophy',       color: '#10B981' },
  { id: 'futbol',            name: 'Futbol',           slug: 'futbol',            iconName: 'circle-dot',   color: '#10B981', parentId: 'spor', standalone: true },
  { id: 'basketbol',         name: 'Basketbol',        slug: 'basketbol',         iconName: 'circle',       color: '#10B981', parentId: 'spor', standalone: true },
  { id: 'voleybol',          name: 'Voleybol',         slug: 'voleybol',          iconName: 'circle',       color: '#10B981', parentId: 'spor', standalone: true },
  { id: 'hentbol',           name: 'Hentbol',          slug: 'hentbol',           iconName: 'circle',       color: '#10B981', parentId: 'spor' },
  { id: 'atletizm',          name: 'Atletizm',         slug: 'atletizm',          iconName: 'zap',          color: '#10B981', parentId: 'spor' },
  { id: 'gures',             name: 'Güreş',            slug: 'gures',             iconName: 'swords',       color: '#10B981', parentId: 'spor' },
  { id: 'dunya-kupasi-2026', name: '2026 Dünya Kupası', slug: 'dunya-kupasi-2026', iconName: 'trophy',      color: '#F59E0B', parentId: 'spor', standalone: true },

  // ── Kültür + alt kategoriler ────────────────────────────────────────────────
  { id: 'kultur',      name: 'Kültür',      slug: 'kultur',      iconName: 'palette',      color: '#8B5CF6' },
  { id: 'sinema',      name: 'Sinema',      slug: 'sinema',      iconName: 'film',         color: '#8B5CF6', parentId: 'kultur' },
  { id: 'tiyatro',     name: 'Tiyatro',     slug: 'tiyatro',     iconName: 'theater',      color: '#8B5CF6', parentId: 'kultur' },
  { id: 'konser',      name: 'Konser',      slug: 'konser',      iconName: 'music',        color: '#8B5CF6', parentId: 'kultur' },
  { id: 'festival',    name: 'Festival',    slug: 'festival',    iconName: 'party-popper', color: '#8B5CF6', parentId: 'kultur' },

  // ── Yeni kategoriler ────────────────────────────────────────────────────────
  { id: 'yasam',         name: 'Yaşam',         slug: 'yasam',         iconName: 'leaf',        color: '#16A34A' },
  { id: 'gastronomi',    name: 'Gastronomi',    slug: 'gastronomi',    iconName: 'utensils',    color: '#F97316' },
  { id: 'otomobil',      name: 'Otomobil',      slug: 'otomobil',      iconName: 'car',         color: '#64748B' },
  { id: 'meteoroloji',   name: 'Meteoroloji',   slug: 'meteoroloji',   iconName: 'cloud-rain',  color: '#0EA5E9' },

  // ── Özel kategoriler ────────────────────────────────────────────────────────
  { id: 'son-dakika',    name: 'Son Dakika',    slug: 'son-dakika',    iconName: 'zap',         color: '#EF4444' },
  { id: 'etkinlikler',   name: 'Etkinlikler',   slug: 'etkinlikler',   iconName: 'calendar',    color: '#8B5CF6' },
]

/** Returns subcategories of a given parent category id */
export function getSubcategories(parentId: string): CategoryDef[] {
  return DEFAULT_CATEGORIES.filter((c) => c.parentId === parentId)
}

/** Returns the parent category for a given category id */
export function getParentCategory(categoryId: string): CategoryDef | undefined {
  const cat = DEFAULT_CATEGORIES.find((c) => c.id === categoryId)
  if (!cat?.parentId) return undefined
  return DEFAULT_CATEGORIES.find((c) => c.id === cat.parentId)
}

/**
 * All category ids that belong to a parent (inclusive).
 * Used to query Firestore for "show all sport news" (spor + futbol + basketbol + ...).
 * Standalone subcategories are EXCLUDED — their articles stay isolated on their own page.
 */
export function getCategoryFamily(parentId: string): string[] {
  return [
    parentId,
    ...getSubcategories(parentId)
      .filter((c) => !c.standalone)
      .map((c) => c.id),
  ]
}

/**
 * Categories shown in the main sidebar nav (in order).
 * Subcategories are shown inside their parent's page, not here.
 */
export const SIDEBAR_MAIN_CATEGORY_IDS = [
  'gundem',
  'siyaset',
  'dunya',
  'spor',
  'teknoloji',
  'ekonomi',
  'saglik',
  'bilim',
  'meteoroloji',
  'kultur',
  'gastronomi',
  'otomobil',
] as const

/**
 * Üst gezinme barlarında (CategoryNav mobile + FeedCategoryBar) gösterilecek
 * kategori id'leri — TEK kaynak. Yerel haber bağlantısı kart düzeyinde
 * eklenir (slug yerine sabit route).
 */
export const TOP_NAV_CATEGORY_IDS = [
  'gundem',
  'siyaset',
  'ekonomi',
  'spor',
  'dunya',
  'teknoloji',
  'saglik',
  'magazin',
  'kultur',
  'gastronomi',
  'otomobil',
  'bilim',
] as const

/**
 * Üst nav kategorileri — id, label, href tuple'ı, DEFAULT_CATEGORIES'den
 * türetiliyor. Slug yoksa id'yi kullanır.
 */
export function getTopNavCategories(): Array<{ id: string; label: string; href: string }> {
  return TOP_NAV_CATEGORY_IDS
    .map((id) => DEFAULT_CATEGORIES.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => ({
      id: c!.id,
      label: c!.name,
      href: `/kategori/${c!.slug ?? c!.id}`,
    }))
}

export interface SwipeDestination {
  id: string
  label: string
  href: string
}

/** Ana feed + üst nav kategorileri + yerel — yatay kaydırma sırası (tek kaynak). */
export function getSwipeableFeedDestinations(): SwipeDestination[] {
  return [
    { id: 'feed', label: 'Ana Sayfa', href: ROUTES.FEED },
    ...getTopNavCategories(),
    { id: 'yerel', label: 'Yerel', href: ROUTES.LOCAL },
  ]
}

/** Aktif sayfayı swipe zincirindeki üst düzey kategori anahtarına çevirir. */
export function resolveSwipeCategoryKey(pathname: string): string | null {
  if (pathname === ROUTES.FEED) return 'feed'
  if (pathname === ROUTES.LOCAL || pathname.startsWith(`${ROUTES.LOCAL}/`)) return 'yerel'

  const match = pathname.match(/^\/kategori\/([^/]+)/)
  if (!match) return null

  const slug = decodeURIComponent(match[1]!)
  const cat = DEFAULT_CATEGORIES.find((c) => c.slug === slug || c.id === slug)
  if (!cat) return null
  if (cat.id === 'yerel-haber') return 'yerel'

  const topNavSet = new Set<string>(TOP_NAV_CATEGORY_IDS)
  if (topNavSet.has(cat.id)) return cat.id
  if (cat.parentId && topNavSet.has(cat.parentId)) return cat.parentId

  return null
}

export function getSwipeIndexFromPathname(pathname: string): number {
  const key = resolveSwipeCategoryKey(pathname)
  if (!key) return -1
  return getSwipeableFeedDestinations().findIndex((d) => d.id === key)
}
