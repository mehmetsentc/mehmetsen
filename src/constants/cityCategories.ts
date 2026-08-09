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
  { id: 'video', label: 'Video', categoryId: null },
] as const

/**
 * National/meta categories that must never appear in city subdomain filter chips.
 * Section tabs (spor, etkinlik) are excluded here — they have dedicated routes.
 */
export const CITY_DYNAMIC_NAV_EXCLUDED_IDS = new Set([
  'trend',
  'son-dakika',
  'yerel-haber',
  'kibris-haberleri',
  'dunya',
  'spor',
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
  href: string
  iconName: 'home' | 'calendar' | 'trophy' | 'map-pin'
}

export const CITY_BOTTOM_NAV: readonly CityBottomNavItem[] = [
  { id: 'feed', label: 'Ana Feed', href: '/', iconName: 'home' },
  { id: 'etkinlik', label: 'Etkinlik', href: '/etkinlik', iconName: 'calendar' },
  { id: 'spor', label: 'Spor', href: '/spor', iconName: 'trophy' },
  { id: 'ilceler', label: 'İlçeler', href: '/ilceler', iconName: 'map-pin' },
] as const
