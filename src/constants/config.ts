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
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  // ── Ana kategoriler ─────────────────────────────────────────────────────────
  { id: 'trend',       name: 'Trending',    slug: 'trend',       iconName: 'flame',        color: '#FF6B35' },
  { id: 'gundem',      name: 'Gündem',      slug: 'gundem',      iconName: 'newspaper',    color: '#EF4444' },
  { id: 'yerel-haber', name: 'Yerel Haber', slug: 'yerel-haber', iconName: 'map-pin',      color: '#059669' },
  { id: 'siyaset',     name: 'Siyaset',     slug: 'siyaset',     iconName: 'landmark',     color: '#7C3AED' },
  { id: 'dunya',       name: 'Dünya',       slug: 'dunya',       iconName: 'globe',        color: '#6B7280' },
  { id: 'ekonomi',     name: 'Ekonomi',     slug: 'ekonomi',     iconName: 'trending-up',  color: '#F59E0B' },
  { id: 'teknoloji',   name: 'Teknoloji',   slug: 'teknoloji',   iconName: 'cpu',          color: '#3B82F6' },
  { id: 'saglik',      name: 'Sağlık',      slug: 'saglik',      iconName: 'heart',        color: '#EC4899' },
  { id: 'bilim',       name: 'Bilim',       slug: 'bilim',       iconName: 'flask',        color: '#14B8A6' },
  { id: 'magazin',     name: 'Magazin',     slug: 'magazin',     iconName: 'star',         color: '#F472B6' },

  // ── Spor + alt kategoriler ──────────────────────────────────────────────────
  { id: 'spor',        name: 'Spor',        slug: 'spor',        iconName: 'trophy',       color: '#10B981' },
  { id: 'futbol',      name: 'Futbol',      slug: 'futbol',      iconName: 'circle-dot',   color: '#10B981', parentId: 'spor' },
  { id: 'basketbol',   name: 'Basketbol',   slug: 'basketbol',   iconName: 'circle',       color: '#10B981', parentId: 'spor' },
  { id: 'voleybol',    name: 'Voleybol',    slug: 'voleybol',    iconName: 'circle',       color: '#10B981', parentId: 'spor' },
  { id: 'hentbol',     name: 'Hentbol',     slug: 'hentbol',     iconName: 'circle',       color: '#10B981', parentId: 'spor' },
  { id: 'atletizm',    name: 'Atletizm',    slug: 'atletizm',    iconName: 'zap',          color: '#10B981', parentId: 'spor' },
  { id: 'gures',       name: 'Güreş',       slug: 'gures',       iconName: 'swords',       color: '#10B981', parentId: 'spor' },

  // ── Kültür + alt kategoriler ────────────────────────────────────────────────
  { id: 'kultur',      name: 'Kültür',      slug: 'kultur',      iconName: 'palette',      color: '#8B5CF6' },
  { id: 'sinema',      name: 'Sinema',      slug: 'sinema',      iconName: 'film',         color: '#8B5CF6', parentId: 'kultur' },
  { id: 'tiyatro',     name: 'Tiyatro',     slug: 'tiyatro',     iconName: 'theater',      color: '#8B5CF6', parentId: 'kultur' },
  { id: 'konser',      name: 'Konser',      slug: 'konser',      iconName: 'music',        color: '#8B5CF6', parentId: 'kultur' },
  { id: 'festival',    name: 'Festival',    slug: 'festival',    iconName: 'party-popper', color: '#8B5CF6', parentId: 'kultur' },

  // ── Yeni kategoriler ────────────────────────────────────────────────────────
  { id: 'gastronomi',    name: 'Gastronomi',    slug: 'gastronomi',    iconName: 'utensils',    color: '#F97316' },
  { id: 'otomobil',      name: 'Otomobil',      slug: 'otomobil',      iconName: 'car',         color: '#64748B' },
  { id: 'meteoroloji',   name: 'Meteoroloji',   slug: 'meteoroloji',   iconName: 'cloud-rain',  color: '#0EA5E9' },
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
 */
export function getCategoryFamily(parentId: string): string[] {
  return [parentId, ...getSubcategories(parentId).map((c) => c.id)]
}

/**
 * Categories shown in the main sidebar nav (in order).
 * Subcategories are shown inside their parent's page, not here.
 */
export const SIDEBAR_MAIN_CATEGORY_IDS = [
  'gundem',
  'yerel-haber',
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
