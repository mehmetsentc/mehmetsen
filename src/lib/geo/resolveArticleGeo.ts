/**
 * Deterministic article geography resolver (no AI, no geocoding API).
 * Compound identity only: TR:<province>:<district>
 *
 * Safe for server Feed paths and dry-run audits. Does not mutate storage.
 */
import {
  getDistrictsForProvince,
  isTurkishProvinceSlug,
  TURKISH_PROVINCES,
} from '@/constants/cities'
import { lookupVerifiedLocalityParent } from '@/constants/verifiedLocalityParents'
import { normalizeGeoSlug } from '@/lib/geo/normalizeGeoSlug'

export type GeoResolutionLevel =
  | 'DISTRICT_EXACT'
  | 'DISTRICT_NORMALIZED'
  | 'LOCALITY_PARENT'
  | 'PROVINCE_ONLY'
  | 'UNRESOLVED'
  | 'NONE'

export type GeoResolutionSource =
  | 'compound_slugs'
  | 'unicode_normalized'
  | 'verified_locality_parent'
  | 'province_slug'
  | 'none'

/** Deterministic confidence (not ML probability). */
export type GeoResolutionConfidence = 'high' | 'medium' | 'low' | 'none'

export type ResolveArticleGeoInput = {
  province?: string | null
  citySlug?: string | null
  city?: string | null
  district?: string | null
  districtSlug?: string | null
  locality?: string | null
  /** Optional free-text place that may be locality or district when labeled poorly */
  placeHint?: string | null
}

export type ResolvedArticleGeo = {
  canonicalProvince: string | null
  canonicalDistrict: string | null
  canonicalGeoId: string | null
  locality: string | null
  localityDisplayName: string | null
  /** Original tokens preserved for provenance / UI */
  raw: {
    province: string | null
    citySlug: string | null
    city: string | null
    district: string | null
    districtSlug: string | null
    locality: string | null
  }
  resolutionLevel: GeoResolutionLevel
  resolutionSource: GeoResolutionSource
  confidence: GeoResolutionConfidence
  /** True when raw district/city tokens needed unicode slug normalize */
  unicodeNormalized: boolean
}

const PROVINCE_SLUG_SET = new Set(TURKISH_PROVINCES.map((p) => p.slug))

function districtExistsInProvince(provinceSlug: string, districtSlug: string): boolean {
  const rows = getDistrictsForProvince(provinceSlug)
  return rows.some((d) => d.slug === districtSlug)
}

function makeGeoId(provinceSlug: string, districtSlug: string): string {
  return `TR:${provinceSlug}:${districtSlug}`
}

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    const t = (v ?? '').trim()
    if (t) return t
  }
  return null
}

/**
 * Resolve province slug from citySlug / province / city display — never from district alone.
 */
function resolveProvinceSlug(input: ResolveArticleGeoInput): {
  provinceSlug: string | null
  unicodeNormalized: boolean
} {
  const candidates = [
    input.citySlug,
    input.province,
    input.city,
  ]
  let unicodeNormalized = false
  for (const raw of candidates) {
    if (!raw?.trim()) continue
    const n = normalizeGeoSlug(raw)
    if (!n) continue
    if (n !== raw.trim().toLowerCase()) unicodeNormalized = true
    if (PROVINCE_SLUG_SET.has(n) || isTurkishProvinceSlug(n)) {
      return { provinceSlug: n, unicodeNormalized }
    }
  }
  return { provinceSlug: null, unicodeNormalized }
}

/**
 * Centralized deterministic article geo resolver.
 */
export function resolveArticleGeo(input: ResolveArticleGeoInput): ResolvedArticleGeo {
  const raw = {
    province: firstNonEmpty(input.province),
    citySlug: firstNonEmpty(input.citySlug),
    city: firstNonEmpty(input.city),
    district: firstNonEmpty(input.district),
    districtSlug: firstNonEmpty(input.districtSlug),
    locality: firstNonEmpty(input.locality, input.placeHint),
  }

  const empty = (level: GeoResolutionLevel, source: GeoResolutionSource, confidence: GeoResolutionConfidence): ResolvedArticleGeo => ({
    canonicalProvince: null,
    canonicalDistrict: null,
    canonicalGeoId: null,
    locality: null,
    localityDisplayName: null,
    raw,
    resolutionLevel: level,
    resolutionSource: source,
    confidence,
    unicodeNormalized: false,
  })

  const { provinceSlug, unicodeNormalized: provUnicode } = resolveProvinceSlug(input)
  const districtRaw = firstNonEmpty(input.districtSlug, input.district)
  const localityRaw = firstNonEmpty(input.locality, input.placeHint)
  const districtNorm = districtRaw ? normalizeGeoSlug(districtRaw) : null
  const localityNorm = localityRaw ? normalizeGeoSlug(localityRaw) : null
  const districtUnicode = Boolean(
    districtRaw && districtNorm && districtNorm !== districtRaw.trim().toLowerCase()
  )
  const unicodeNormalized = provUnicode || districtUnicode

  // 1) Province + district (compound) — never district alone
  if (provinceSlug && districtNorm) {
    if (districtExistsInProvince(provinceSlug, districtNorm)) {
      const exact =
        !districtUnicode &&
        Boolean(districtRaw && districtRaw.trim().toLowerCase() === districtNorm)
      return {
        canonicalProvince: provinceSlug,
        canonicalDistrict: districtNorm,
        canonicalGeoId: makeGeoId(provinceSlug, districtNorm),
        locality: localityNorm,
        localityDisplayName: localityRaw,
        raw,
        resolutionLevel: exact ? 'DISTRICT_EXACT' : 'DISTRICT_NORMALIZED',
        resolutionSource: exact ? 'compound_slugs' : 'unicode_normalized',
        confidence: 'high',
        unicodeNormalized,
      }
    }
    // District token may actually be a verified locality under this province
    const asLocality = lookupVerifiedLocalityParent(provinceSlug, districtNorm)
    if (asLocality) {
      return {
        canonicalProvince: asLocality.provinceSlug,
        canonicalDistrict: asLocality.districtSlug,
        canonicalGeoId: asLocality.geoId,
        locality: asLocality.localitySlug,
        localityDisplayName: localityRaw || asLocality.localityDisplayName,
        raw,
        resolutionLevel: 'LOCALITY_PARENT',
        resolutionSource: 'verified_locality_parent',
        confidence: 'high',
        unicodeNormalized,
      }
    }
    // Province known but district unknown under that province → unresolved district
    return {
      canonicalProvince: provinceSlug,
      canonicalDistrict: null,
      canonicalGeoId: null,
      locality: localityNorm,
      localityDisplayName: localityRaw,
      raw,
      resolutionLevel: 'UNRESOLVED',
      resolutionSource: 'compound_slugs',
      confidence: 'low',
      unicodeNormalized,
    }
  }

  // 2) Province + locality parent (verified registry only)
  if (provinceSlug && localityNorm) {
    const parent = lookupVerifiedLocalityParent(provinceSlug, localityNorm)
    if (parent) {
      return {
        canonicalProvince: parent.provinceSlug,
        canonicalDistrict: parent.districtSlug,
        canonicalGeoId: parent.geoId,
        locality: parent.localitySlug,
        localityDisplayName: localityRaw || parent.localityDisplayName,
        raw,
        resolutionLevel: 'LOCALITY_PARENT',
        resolutionSource: 'verified_locality_parent',
        confidence: 'high',
        unicodeNormalized: provUnicode || Boolean(localityRaw && localityNorm !== localityRaw.trim().toLowerCase()),
      }
    }
  }

  // 3) Province only
  if (provinceSlug) {
    return {
      canonicalProvince: provinceSlug,
      canonicalDistrict: null,
      canonicalGeoId: null,
      locality: localityNorm,
      localityDisplayName: localityRaw,
      raw,
      resolutionLevel: 'PROVINCE_ONLY',
      resolutionSource: 'province_slug',
      confidence: 'medium',
      unicodeNormalized: provUnicode,
    }
  }

  // 4) District without province → UNRESOLVED (never guess via flat map)
  if (districtNorm || localityNorm) {
    return {
      ...empty('UNRESOLVED', 'none', 'none'),
      locality: localityNorm,
      localityDisplayName: localityRaw,
      unicodeNormalized: districtUnicode,
    }
  }

  return empty('NONE', 'none', 'none')
}
