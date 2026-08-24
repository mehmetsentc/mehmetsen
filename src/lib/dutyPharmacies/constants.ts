export const CANAKKALE_EO_SOURCE_URL =
  'https://www.canakkaleeo.org.tr/nobetci-eczaneler'
export const CANAKKALE_EO_SOURCE_LABEL = 'Çanakkale Eczacı Odası'

export const ANTALYA_EO_SOURCE_URL =
  'https://www.antalyaeo.org.tr/tr/nobetci-eczaneler'
export const ANTALYA_EO_SOURCE_LABEL = 'Antalya Eczacı Odası'

/** City tenants that publish a duty-pharmacy page. */
export const DUTY_PHARMACY_CITY_SLUGS = ['canakkale', 'antalya'] as const
export type DutyPharmacyCitySlug = (typeof DUTY_PHARMACY_CITY_SLUGS)[number]

/** @deprecated Prefer {@link DUTY_PHARMACY_CITY_SLUGS} / {@link isDutyPharmacyCity}. */
export const DUTY_PHARMACY_CITY_SLUG = 'canakkale' as const

export const DUTY_PHARMACIES_CACHE_TAG = 'duty-pharmacies'

/** @deprecated Prefer {@link dutyPharmacyDocId}. */
export const DUTY_PHARMACY_CURRENT_DOC_ID = 'canakkale'

export function isDutyPharmacyCity(
  slug: string | null | undefined
): slug is DutyPharmacyCitySlug {
  return (
    typeof slug === 'string' &&
    (DUTY_PHARMACY_CITY_SLUGS as readonly string[]).includes(slug)
  )
}

export function dutyPharmacyDocId(citySlug: string): string {
  return citySlug
}

export function dutyPharmacyArchiveDocId(
  citySlug: string,
  dutyDate: string
): string {
  return `${citySlug}__${dutyDate}`
}

export function dutyPharmacySourceForCity(citySlug: string): {
  url: string
  label: string
} | null {
  if (citySlug === 'canakkale') {
    return { url: CANAKKALE_EO_SOURCE_URL, label: CANAKKALE_EO_SOURCE_LABEL }
  }
  if (citySlug === 'antalya') {
    return { url: ANTALYA_EO_SOURCE_URL, label: ANTALYA_EO_SOURCE_LABEL }
  }
  return null
}
