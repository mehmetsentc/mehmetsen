/** On-duty pharmacy scraped from a provincial chamber of pharmacists. */

export interface DutyPharmacy {
  name: string
  address: string
  phone: string
  phoneHref: string
  /** Raw duty window text from the source page. */
  dutyLabel: string
  dutyStart: string | null
  dutyEnd: string | null
  mapsUrl: string | null
  lat: number | null
  lng: number | null
}

export interface DutyPharmacyGroup {
  district: string
  districtSlug: string
  pharmacies: DutyPharmacy[]
}

export interface DutyPharmacySnapshot {
  citySlug: string
  sourceUrl: string
  sourceLabel: string
  fetchedAt: string
  /** Istanbul calendar date of the shift start (YYYY-MM-DD). */
  dutyDate: string | null
  pharmacyCount: number
  groups: DutyPharmacyGroup[]
}
