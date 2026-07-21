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
  { id: 'kibris-haberleri', name: 'Kıbrıs Haberleri', slug: 'kibris-haberleri', iconName: 'flag', color: '#0E7490' },
  { id: 'ekonomi',     name: 'Ekonomi',     slug: 'ekonomi',     iconName: 'trending-up',  color: '#F59E0B' },
  { id: 'borsa',       name: 'Borsa',       slug: 'borsa',       iconName: 'bar-chart-2',  color: '#22C55E', parentId: 'ekonomi', standalone: true },
  { id: 'kripto',      name: 'Kripto',      slug: 'kripto',      iconName: 'bitcoin',      color: '#F7931A', parentId: 'ekonomi', standalone: true },
  { id: 'finans-piyasa', name: 'Finans & Piyasa', slug: 'finans-piyasa', iconName: 'chart-line', color: '#D97706', parentId: 'ekonomi' },
  { id: 'emlak-konut', name: 'Emlak & Konut', slug: 'emlak-konut', iconName: 'building-2', color: '#B45309', parentId: 'ekonomi' },
  { id: 'enerji',      name: 'Enerji',      slug: 'enerji',      iconName: 'bolt',         color: '#CA8A04', parentId: 'ekonomi' },
  { id: 'is-kariyer',  name: 'İş & Kariyer', slug: 'is-kariyer', iconName: 'briefcase',    color: '#A16207', parentId: 'ekonomi' },
  { id: 'teknoloji',   name: 'Teknoloji',   slug: 'teknoloji',   iconName: 'cpu',          color: '#3B82F6' },
  { id: 'saglik',      name: 'Sağlık',      slug: 'saglik',      iconName: 'heart',        color: '#EC4899' },
  { id: 'bilim',       name: 'Bilim',       slug: 'bilim',       iconName: 'flask',        color: '#14B8A6' },
  { id: 'egitim',      name: 'Eğitim',      slug: 'egitim',      iconName: 'graduation-cap', color: '#2563EB' },
  { id: 'cevre-iklim', name: 'Çevre & İklim', slug: 'cevre-iklim', iconName: 'tree-pine', color: '#15803D' },
  { id: 'oyun-espor',  name: 'Oyun & Espor', slug: 'oyun-espor', iconName: 'gamepad-2',    color: '#7C3AED' },
  { id: 'din-inanc',   name: 'Din & İnanç', slug: 'din-inanc',  iconName: 'moon-star',    color: '#0F766E' },
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

  // ── Yaşam + alt kategoriler ─────────────────────────────────────────────────
  { id: 'yasam',         name: 'Yaşam',         slug: 'yasam',         iconName: 'leaf',        color: '#16A34A' },
  { id: 'astroloji',     name: 'Astroloji',     slug: 'astroloji',     iconName: 'sparkles',    color: '#7C3AED', parentId: 'yasam' },
  { id: 'moda',          name: 'Moda',           slug: 'moda',          iconName: 'shirt',       color: '#DB2777', parentId: 'yasam' },
  { id: 'anne-cocuk',    name: 'Anne & Çocuk',   slug: 'anne-cocuk',    iconName: 'baby',        color: '#E879F9', parentId: 'yasam' },
  { id: 'dekorasyon',    name: 'Dekorasyon',     slug: 'dekorasyon',    iconName: 'sofa',        color: '#C2410C', parentId: 'yasam' },
  { id: 'iliskiler',     name: 'İlişkiler',      slug: 'iliskiler',     iconName: 'heart-handshake', color: '#E11D48', parentId: 'yasam' },
  { id: 'gastronomi',    name: 'Gastronomi',    slug: 'gastronomi',    iconName: 'utensils',    color: '#F97316' },
  { id: 'otomobil',      name: 'Otomobil',      slug: 'otomobil',      iconName: 'car',         color: '#64748B' },
  { id: 'meteoroloji',   name: 'Meteoroloji',   slug: 'meteoroloji',   iconName: 'cloud-rain',  color: '#0EA5E9' },
  { id: 'turizm',        name: 'Turizm',        slug: 'turizm',        iconName: 'plane',       color: '#0284C7' },
  { id: 'gezi',          name: 'Gezi',          slug: 'gezi',          iconName: 'map',         color: '#0891B2' },
  { id: 'asayis',        name: '3. Sayfa',      slug: 'asayis',        iconName: 'shield-alert', color: '#B45309' },

  // ── Tarih ───────────────────────────────────────────────────────────────────
  { id: 'tarih',         name: 'Tarih',         slug: 'tarih',         iconName: 'book-open',   color: '#92400E' },

  // ── Özel kategoriler ────────────────────────────────────────────────────────
  { id: 'son-dakika',    name: 'Son Dakika',    slug: 'son-dakika',    iconName: 'zap',         color: '#EF4444' },
  { id: 'etkinlikler',   name: 'Etkinlikler',   slug: 'etkinlikler',   iconName: 'calendar',    color: '#8B5CF6' },
]

/** Admin CMS haber editörü — gruplu kategori seçici (tek kaynak: DEFAULT_CATEGORIES). */
const ADMIN_CATEGORY_GROUP_DEFS: Array<{ label: string; ids: string[] }> = [
  { label: 'Genel', ids: ['trend', 'gundem', 'yerel-haber', 'siyaset', 'dunya', 'kibris-haberleri', 'asayis', 'son-dakika'] },
  { label: 'Ekonomi', ids: ['ekonomi'] },
  { label: 'Spor', ids: ['spor'] },
  { label: 'Teknoloji & Bilim', ids: ['teknoloji', 'bilim', 'oyun-espor'] },
  { label: 'Eğitim & Toplum', ids: ['egitim', 'cevre-iklim', 'din-inanc'] },
  { label: 'Yaşam & Turizm', ids: ['saglik', 'yasam', 'astroloji', 'gastronomi', 'turizm', 'gezi', 'otomobil', 'meteoroloji'] },
  { label: 'Kültür & Magazin', ids: ['kultur', 'magazin'] },
  { label: 'Tarih', ids: ['tarih'] },
  { label: 'Özel', ids: ['etkinlikler'] },
]

export function getAdminCategoryGroups(): Array<{ label: string; categories: CategoryDef[] }> {
  const used = new Set<string>()

  const groups = ADMIN_CATEGORY_GROUP_DEFS.map(({ label, ids }) => ({
    label,
    categories: ids.flatMap((id) => {
      const parent = DEFAULT_CATEGORIES.find((c) => c.id === id)
      if (!parent) return []
      const items = [parent, ...getSubcategories(id)]
      return items.filter((cat) => {
        if (used.has(cat.id)) return false
        used.add(cat.id)
        return true
      })
    }),
  })).filter((g) => g.categories.length > 0)

  const remaining = DEFAULT_CATEGORIES.filter((c) => !used.has(c.id))
  if (remaining.length > 0) {
    groups.push({ label: 'Diğer', categories: remaining })
  }

  return groups
}

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
  'kibris-haberleri',
  'spor',
  'teknoloji',
  'ekonomi',
  'egitim',
  'saglik',
  'yasam',
  'bilim',
  'cevre-iklim',
  'oyun-espor',
  'din-inanc',
  'meteoroloji',
  'kultur',
  'gastronomi',
  'otomobil',
  'turizm',
  'tarih',
  'asayis',
] as const

/**
 * Üst gezinme barlarında (CategoryNav mobile + FeedCategoryBar) gösterilecek
 * kategori id'leri — TEK kaynak. Yerel haber bağlantısı kart düzeyinde
 * eklenir (slug yerine sabit route).
 */
export const TOP_NAV_CATEGORY_IDS = [
  'gundem',
  'asayis',
  'spor',
  'dunya',
  'kibris-haberleri',
  'siyaset',
  'ekonomi',
  'egitim',
  'turizm',
  'gezi',
  'teknoloji',
  'bilim',
  'cevre-iklim',
  'oyun-espor',
  'din-inanc',
  'yasam',
  'otomobil',
  'kultur',
  'sinema',
  'tiyatro',
  'magazin',
  'tarih',
] as const

export interface SiteNavItem {
  id: string
  label: string
  href: string
  /** Kültür alt kategorileri gibi girintili linkler */
  indent?: boolean
}

/**
 * Header + footer haber kategorileri — tek kaynak sıra.
 * Ana Sayfa → … → Magazin → Teve
 */
export function getSiteNavItems(): SiteNavItem[] {
  const categoryLink = (id: string, label?: string): SiteNavItem | null => {
    const def = DEFAULT_CATEGORIES.find((c) => c.id === id)
    if (!def) return null
    return {
      id,
      label: label ?? def.name,
      href: ROUTES.CATEGORY(def.slug ?? def.id),
    }
  }

  const items: Array<SiteNavItem | null> = [
    { id: 'feed', label: 'Ana Sayfa', href: ROUTES.FEED },
    categoryLink('gundem'),
    { id: 'yerel', label: 'Yerel Haber', href: ROUTES.LOCAL },
    categoryLink('asayis', '3. Sayfa'),
    categoryLink('spor'),
    categoryLink('dunya'),
    categoryLink('kibris-haberleri'),
    categoryLink('siyaset'),
    categoryLink('ekonomi'),
    categoryLink('egitim'),
    categoryLink('cevre-iklim'),
    categoryLink('oyun-espor'),
    categoryLink('din-inanc'),
    categoryLink('turizm'),
    categoryLink('gezi'),
    categoryLink('teknoloji'),
    categoryLink('bilim'),
    categoryLink('yasam'),
    categoryLink('astroloji') ? { ...categoryLink('astroloji')!, indent: true } : null,
    categoryLink('otomobil', 'Otomotiv'),
    categoryLink('kultur'),
    categoryLink('sinema') ? { ...categoryLink('sinema')!, indent: true } : null,
    categoryLink('tiyatro') ? { ...categoryLink('tiyatro')!, indent: true } : null,
    { id: 'teve-sub', label: 'Teve', href: ROUTES.REELS, indent: true },
    categoryLink('magazin'),
    categoryLink('tarih'),
    { id: 'teve', label: 'Teve', href: ROUTES.REELS },
  ]

  return items.filter((item): item is SiteNavItem => item !== null)
}

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

/** XML ve HTML site haritası bağlantıları — footer / site-haritasi sayfası. */
export function getSitemapLinks(siteUrl: string) {
  return [
    { label: 'Site Haritası', href: ROUTES.SITE_MAP, description: 'Tüm kategoriler ve sayfalar' },
    { label: 'XML Site Haritası', href: `${siteUrl}/sitemap.xml`, description: 'Arama motorları için ana indeks' },
    { label: 'Haber Site Haritası', href: `${siteUrl}/news-sitemap.xml`, description: 'Son haberler' },
    { label: 'Video Site Haritası', href: `${siteUrl}/video-sitemap.xml`, description: 'Video içerikler' },
    { label: 'Görsel Site Haritası', href: `${siteUrl}/images-sitemap.xml`, description: 'Haber görselleri' },
  ] as const
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
  if (cat.id === 'sinema' || cat.id === 'tiyatro') return cat.id
  if (cat.id === 'astroloji') return 'yasam'

  return null
}

export function getSwipeIndexFromPathname(pathname: string): number {
  const key = resolveSwipeCategoryKey(pathname)
  if (!key) return -1
  return getSwipeableFeedDestinations().findIndex((d) => d.id === key)
}
