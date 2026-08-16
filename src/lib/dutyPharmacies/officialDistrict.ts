import { getDistrictsForProvince } from '@/constants/cities'
import { DUTY_PHARMACY_CITY_SLUG } from '@/lib/dutyPharmacies/constants'
import type { DutyPharmacyGroup } from '@/types/dutyPharmacy'

export interface DutyPharmacyDistrictChip {
  slug: string
  name: string
  count: number
}

export function getDutyPharmacyOfficialDistricts(): Array<{ slug: string; name: string }> {
  return getDistrictsForProvince(DUTY_PHARMACY_CITY_SLUG)
}

/** Map a scraped group slug (e.g. ayvacik-kucukkuyu) onto the official ilçe. */
export function resolveOfficialDistrictSlug(groupSlug: string): string {
  const slugs = getDutyPharmacyOfficialDistricts()
    .map((d) => d.slug)
    .sort((a, b) => b.length - a.length)
  for (const slug of slugs) {
    if (groupSlug === slug || groupSlug.startsWith(`${slug}-`)) return slug
  }
  return groupSlug
}

export function filterDutyPharmacyGroups(
  groups: DutyPharmacyGroup[],
  officialSlug: string | null | undefined
): DutyPharmacyGroup[] {
  if (!officialSlug) return groups
  return groups.filter(
    (group) => resolveOfficialDistrictSlug(group.districtSlug) === officialSlug
  )
}

export function dutyPharmacyDistrictChips(
  groups: DutyPharmacyGroup[]
): DutyPharmacyDistrictChip[] {
  const official = getDutyPharmacyOfficialDistricts()
  const counts = new Map<string, number>()
  const order: string[] = []

  for (const group of groups) {
    const slug = resolveOfficialDistrictSlug(group.districtSlug)
    if (!counts.has(slug)) order.push(slug)
    counts.set(slug, (counts.get(slug) ?? 0) + group.pharmacies.length)
  }

  return order.flatMap((slug) => {
    const name = official.find((d) => d.slug === slug)?.name
    const count = counts.get(slug) ?? 0
    if (!name || count === 0) return []
    return [{ slug, name, count }]
  })
}
