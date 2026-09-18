/**
 * City Feed 2 highlights — never mix another province into Çanakkale / Antalya rails.
 */

export function normalizeFeedRailCitySlug(
  citySlug: string | null | undefined
): string | null {
  const city = citySlug?.trim().toLowerCase()
  return city || null
}

export function railItemMatchesCity(
  item: { citySlug?: string | null },
  citySlug: string | null | undefined
): boolean {
  const city = normalizeFeedRailCitySlug(citySlug)
  if (!city) return true
  return normalizeFeedRailCitySlug(item.citySlug) === city
}

export function filterRailItemsForCity<T extends { citySlug?: string | null }>(
  items: T[],
  citySlug: string | null | undefined
): T[] {
  const city = normalizeFeedRailCitySlug(citySlug)
  if (!city) return items
  return items.filter((item) => railItemMatchesCity(item, city))
}
