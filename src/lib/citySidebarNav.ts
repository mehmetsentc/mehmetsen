import {
  Home,
  Calendar,
  Trophy,
  MapPin,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react'
import {
  CITY_ALWAYS_VISIBLE_SECTION_IDS,
  CITY_BOTTOM_NAV,
  CITY_NEWS_BACKED_SECTION_ID,
} from '@/constants/cityCategories'
import {
  getSidebarCategoryAccent,
  getSidebarCategoryIcon,
  type SidebarAccent,
} from '@/constants/sidebarNav'
import type { CityCategory } from '@/services/cityNewsService.server'

export interface CitySidebarNavItem {
  id: string
  label: string
  href: string
  icon: LucideIcon
  accent: SidebarAccent
}

const SECTION_ICONS: Record<(typeof CITY_BOTTOM_NAV)[number]['iconName'], LucideIcon> = {
  home: Home,
  calendar: Calendar,
  trophy: Trophy,
  'map-pin': MapPin,
}

export interface CitySectionNavOptions {
  /** When false, hide the Spor section pill (no city spor-family news). */
  hasSpor?: boolean
}

/** City section tabs — Ana Feed, Etkinlik, Spor?, İlçeler. */
export function buildCitySectionNavItems(
  options: CitySectionNavOptions = {}
): CitySidebarNavItem[] {
  const { hasSpor = true } = options
  return CITY_BOTTOM_NAV.filter((item) => {
    if (CITY_ALWAYS_VISIBLE_SECTION_IDS.has(item.id)) return true
    if (item.id === CITY_NEWS_BACKED_SECTION_ID) return hasSpor
    return false
  }).map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    icon: SECTION_ICONS[item.iconName],
    accent: item.id === 'spor' ? 'spor' : item.id === 'etkinlik' ? 'yerel' : 'brand',
  }))
}

/** Dynamic city categories — only those with published city news. */
export function buildCityCategoryNavItems(categories: CityCategory[]): CitySidebarNavItem[] {
  return categories.map((cat) => ({
    id: cat.id,
    label: cat.name,
    href: `/#category-rail-${cat.id}`,
    icon: getSidebarCategoryIcon(cat.id),
    accent: getSidebarCategoryAccent(cat.id),
  }))
}

/**
 * Header pill row: structural sections (with Spor gated) + non-empty news categories.
 * İlçeler stays with sections; category chips follow for horizontal scroll.
 */
export function buildCityHeaderNavItems(
  categories: CityCategory[],
  options: CitySectionNavOptions = {}
): CitySidebarNavItem[] {
  return [
    ...buildCitySectionNavItems(options),
    ...buildCityCategoryNavItems(categories),
  ]
}

/** Home anchor for sidebar brand row. */
export const CITY_SIDEBAR_HOME: CitySidebarNavItem = {
  id: 'home',
  label: 'Ana Sayfa',
  href: '/',
  icon: LayoutGrid,
  accent: 'brand',
}
