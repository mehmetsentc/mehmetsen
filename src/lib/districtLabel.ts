import { DISTRICT_DISPLAY_NAMES } from '@/constants/cities'

/** Resolve a human-readable ilçe name from stored geo fields. Empty → null (never invent). */
export function resolveDistrictDisplayLabel(input: {
  district?: string | null
  districtSlug?: string | null
}): string | null {
  const slug = input.districtSlug?.trim().toLowerCase()
  if (slug) {
    const fromMap = DISTRICT_DISPLAY_NAMES[slug]
    if (fromMap?.trim()) return fromMap.trim()
  }

  const name = input.district?.trim()
  if (name) return name

  return null
}

/** Append ilçe to a category label: "Yerel Siyaset · Biga". */
export function withDistrictCategoryLabel(
  categoryLabel: string,
  districtLabel: string | null | undefined
): string {
  const cat = categoryLabel.trim()
  const district = districtLabel?.trim()
  if (!district) return cat
  if (!cat) return district
  return `${cat} · ${district}`
}
