import { getDistrictsForProvince } from '@/constants/cities'
import { isDutyPharmacyCity } from '@/lib/dutyPharmacies/constants'
import type { DutyPharmacyGroup } from '@/types/dutyPharmacy'

export interface DutyPharmacyDistrictChip {
  slug: string
  name: string
  count: number
}

export function getDutyPharmacyOfficialDistricts(
  citySlug: string
): Array<{ slug: string; name: string }> {
  if (!isDutyPharmacyCity(citySlug)) return []
  return getDistrictsForProvince(citySlug)
}

/** Map a scraped group slug (e.g. ayvacik-kucukkuyu) onto the official ilçe. */
export function resolveOfficialDistrictSlug(
  groupSlug: string,
  citySlug: string
): string {
  const slugs = getDutyPharmacyOfficialDistricts(citySlug)
    .map((d) => d.slug)
    .sort((a, b) => b.length - a.length)
  for (const slug of slugs) {
    if (groupSlug === slug || groupSlug.startsWith(`${slug}-`)) return slug
  }
  return groupSlug
}

export function filterDutyPharmacyGroups(
  groups: DutyPharmacyGroup[],
  officialSlug: string | null | undefined,
  citySlug: string
): DutyPharmacyGroup[] {
  if (!officialSlug) return groups
  return groups.filter(
    (group) =>
      resolveOfficialDistrictSlug(group.districtSlug, citySlug) === officialSlug
  )
}

export function dutyPharmacyDistrictChips(
  groups: DutyPharmacyGroup[],
  citySlug: string
): DutyPharmacyDistrictChip[] {
  const official = getDutyPharmacyOfficialDistricts(citySlug)
  const counts = new Map<string, number>()
  const order: string[] = []

  for (const group of groups) {
    const slug = resolveOfficialDistrictSlug(group.districtSlug, citySlug)
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
