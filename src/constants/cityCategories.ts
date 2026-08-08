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
