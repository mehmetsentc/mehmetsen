/**
 * Category chip definitions for city tenant pages.
 * Maps to existing Firebase categoryId values.
 */

export interface CityCategoryChip {
  id: string
  label: string
  /** Firebase categoryId filter. null = all news */
  categoryId: string | null
}

export const CITY_CATEGORY_CHIPS: readonly CityCategoryChip[] = [
  { id: 'tumu', label: 'Tümü', categoryId: null },
  { id: 'guncel', label: 'Güncel', categoryId: 'gundem' },
  { id: 'siyaset', label: 'Siyaset', categoryId: 'siyaset' },
  { id: 'asayis', label: '3. Sayfa', categoryId: 'asayis' },
  { id: 'ekonomi', label: 'Ekonomi', categoryId: 'ekonomi' },
  { id: 'yasam', label: 'Yaşam', categoryId: 'yasam' },
  { id: 'egitim', label: 'Eğitim', categoryId: 'egitim' },
  { id: 'kultur', label: 'Kültür Sanat', categoryId: 'kultur' },
  { id: 'turizm', label: 'Turizm', categoryId: 'turizm' },
  { id: 'spor', label: 'Spor', categoryId: 'spor' },
  { id: 'duyuru', label: 'Duyuru', categoryId: 'yerel-duyuru' },
  { id: 'video', label: 'Video', categoryId: null },
] as const

/**
 * National/meta categories that must never appear in city subdomain filter chips.
 * Spor stays eligible — it is a Feed 2 chip, not a dock tab.
 */
export const CITY_DYNAMIC_NAV_EXCLUDED_IDS = new Set([
  'trend',
  'son-dakika',
  'yerel-haber',
  'kibris-haberleri',
  'dunya',
  'etkinlikler',
])

/** Chip-ordered category ids eligible for city feed filter nav (excludes tumu/video). */
export const CITY_DYNAMIC_NAV_CHIP_IDS = CITY_CATEGORY_CHIPS.flatMap((chip) =>
  chip.categoryId && !CITY_DYNAMIC_NAV_EXCLUDED_IDS.has(chip.categoryId)
    ? [chip.categoryId]
    : []
)

/**
 * Mobile bottom nav items for city tenant.
 */
export interface CityBottomNavItem {
  id: string
  label: string
  shortLabel?: string
  href: string
  iconName: 'home' | 'zap' | 'calendar' | 'trophy' | 'map-pin' | 'briefcase'
}

export const CITY_BOTTOM_NAV: readonly CityBottomNavItem[] = [
  { id: 'feed', label: 'Feed', shortLabel: 'Feed', href: '/', iconName: 'zap' },
  { id: 'etkinlik', label: 'Etkinlik', shortLabel: 'Etkinlik', href: '/etkinlik', iconName: 'calendar' },
  { id: 'is-ilanlari', label: 'İş', shortLabel: 'İş', href: '/is-ilanlari', iconName: 'briefcase' },
  { id: 'ilceler', label: 'İlçeler', shortLabel: 'İlçeler', href: '/ilceler', iconName: 'map-pin' },
] as const

/**
 * Structural section pills always shown in city header / bottom nav.
 * Spor lives in Feed 2 chips, not the dock.
 */
export const CITY_ALWAYS_VISIBLE_SECTION_IDS = new Set<string>([
  'feed',
  'etkinlik',
  'is-ilanlari',
  'ilceler',
])

/** @deprecated Spor is a Feed 2 category chip, not a dock section. */
export const CITY_NEWS_BACKED_SECTION_ID = 'spor' as const
