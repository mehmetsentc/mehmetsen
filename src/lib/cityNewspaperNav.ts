import { CITY_CATEGORY_CHIPS } from '@/constants/cityCategories'

export type CityNewspaperNavItem = {
  id: string
  label: string
  href: string
}

/** Keep `?tenant=` on localhost so category clicks stay on the city site. */
export function withCityTenantHref(href: string, tenantSlug?: string | null) {
  if (!tenantSlug) return href
  const [path, hash = ''] = href.split('#')
  const [pathname, existing = ''] = path.split('?')
  const params = new URLSearchParams(existing)
  params.set('tenant', tenantSlug)
  const query = params.toString()
  return `${pathname}?${query}${hash ? `#${hash}` : ''}`
}

const CITY_NEWSPAPER_HOME: CityNewspaperNavItem = {
  id: 'feed',
  label: 'Ana Sayfa',
  href: '/',
}

/** Çanakkale / Antalya local chips — no national Dünya / Teknoloji / Video. */
export const CITY_NEWSPAPER_NAV: CityNewspaperNavItem[] = [
  CITY_NEWSPAPER_HOME,
  ...CITY_CATEGORY_CHIPS.filter((chip) => chip.categoryId).map((chip) => ({
    id: chip.id,
    label: chip.label,
    href: `/kategori/${chip.categoryId}`,
  })),
]

/** Prefer categories the city actually publishes; fall back to the local chip set. */
export function buildCityNewspaperNav(
  categories?: { id: string; name: string; slug?: string }[] | null,
  options?: { hasSpor?: boolean }
): CityNewspaperNavItem[] {
  if (!categories?.length) return CITY_NEWSPAPER_NAV
  const items: CityNewspaperNavItem[] = [
    CITY_NEWSPAPER_HOME,
    ...categories.map((category) => ({
      id: category.id,
      label: category.name,
      href: `/kategori/${category.slug || category.id}`,
    })),
  ]
  if (options?.hasSpor && !items.some((item) => item.id === 'spor')) {
    items.push({ id: 'spor', label: 'Spor', href: '/kategori/spor' })
  }
  return items
}
