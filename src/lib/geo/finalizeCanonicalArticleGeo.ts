/**
 * Finalize canonical article geography for newsroom persistence.
 *
 * Runs AFTER geoEngine.enrich + forced overlays + category clears,
 * BEFORE Firestore / PG mirror write.
 *
 * Deterministic only — no AI, no geocoding.
 */
import { DISTRICT_DISPLAY_NAMES, getCityCategoryName } from '@/constants/cities'
import {
  resolveArticleGeo,
  type GeoResolutionLevel,
  type GeoResolutionSource,
  type ResolveArticleGeoInput,
} from '@/lib/geo/resolveArticleGeo'
import { normalizeGeoSlug } from '@/lib/geo/normalizeGeoSlug'

export type FinalizeCanonicalArticleGeoInput = {
  articleIsAbroad: boolean
  /** True when human editor explicitly set province/district (queue edits). */
  editorialGeoLocked?: boolean
  city?: string | null | undefined
  citySlug?: string | null | undefined
  district?: string | null | undefined
  districtSlug?: string | null | undefined
  locality?: string | null | undefined
  forcedCity?: string | null | undefined
  forcedCitySlug?: string | null | undefined
  forcedDistrict?: string | null | undefined
  forcedLocality?: string | null | undefined
}

export type FinalizeCanonicalArticleGeoResult = {
  city: string
  citySlug: string
  district: string
  districtSlug: string
  locality: string
  canonicalGeoId: string | null
  geoResolutionLevel: GeoResolutionLevel
  geoResolutionSource: GeoResolutionSource
  /** For ingestion diagnostics / metrics aggregation */
  metric: GeoResolutionLevel
}

function displayDistrictName(slug: string | null, fallback: string | null): string {
  if (slug && DISTRICT_DISPLAY_NAMES[slug]) return DISTRICT_DISPLAY_NAMES[slug]!
  return (fallback ?? '').trim()
}

function displayCityName(slug: string | null, fallback: string | null): string {
  if (slug) {
    try {
      return getCityCategoryName(slug) || (fallback ?? '').trim()
    } catch {
      /* ignore */
    }
  }
  return (fallback ?? '').trim()
}

/**
 * Build resolver input with evidence precedence:
 * 1. editorial lock (forced* when editorialGeoLocked)
 * 2. current pipeline city/district (includes geoEngine + applied forcedDistrict)
 * 3. forced* as supplemental locality / province hints
 * 4. never invent
 */
export function buildResolveArticleGeoInput(
  input: FinalizeCanonicalArticleGeoInput
): ResolveArticleGeoInput {
  if (input.editorialGeoLocked) {
    return {
      city: input.forcedCity ?? input.city,
      citySlug: input.forcedCitySlug ?? input.citySlug,
      province: input.forcedCity ?? input.city,
      // Editorial forced district outranks stale districtSlug from weaker inference
      district: input.forcedDistrict ?? input.district,
      districtSlug: input.forcedDistrict ? null : input.districtSlug,
      locality: input.forcedLocality ?? input.locality,
    }
  }

  return {
    city: input.city,
    citySlug: input.citySlug,
    province: input.city,
    district: input.district ?? input.forcedDistrict,
    districtSlug: input.districtSlug,
    locality: input.locality ?? input.forcedLocality,
    // If district display was forced but may be a belde name, also pass as locality hint
    placeHint: input.forcedLocality ?? input.locality ?? undefined,
  }
}

/**
 * Apply forcedDistrict to display only when it should not overwrite stronger geoEngine district,
 * unless editorial lock is set.
 */
export function applyForcedDistrictDisplay(input: {
  editorialGeoLocked?: boolean
  geoDistrict: string | null | undefined
  forcedDistrict: string | null | undefined
}): string | null {
  const forced = input.forcedDistrict?.trim() || null
  if (!forced) return input.geoDistrict?.trim() || null
  if (input.editorialGeoLocked) return forced
  if (!input.geoDistrict?.trim()) return forced
  // geoEngine already found a district — keep it (do not paste publisher home district)
  return input.geoDistrict.trim()
}

export function finalizeCanonicalArticleGeo(
  input: FinalizeCanonicalArticleGeoInput
): FinalizeCanonicalArticleGeoResult {
  const empty = (level: GeoResolutionLevel): FinalizeCanonicalArticleGeoResult => ({
    city: '',
    citySlug: '',
    district: '',
    districtSlug: '',
    locality: '',
    canonicalGeoId: null,
    geoResolutionLevel: level,
    geoResolutionSource: 'none',
    metric: level,
  })

  if (input.articleIsAbroad) {
    return empty('NONE')
  }

  // Nothing to resolve
  const hasAny =
    Boolean(input.city?.trim()) ||
    Boolean(input.citySlug?.trim()) ||
    Boolean(input.district?.trim()) ||
    Boolean(input.districtSlug?.trim()) ||
    Boolean(input.locality?.trim()) ||
    Boolean(input.forcedCitySlug?.trim()) ||
    Boolean(input.forcedDistrict?.trim()) ||
    Boolean(input.forcedLocality?.trim())
  if (!hasAny) {
    return empty('NONE')
  }

  const resolved = resolveArticleGeo(buildResolveArticleGeoInput(input))

  const citySlug = resolved.canonicalProvince ?? ''
  const districtSlug = resolved.canonicalDistrict ?? ''
  const locality = resolved.locality ?? ''

  // Preserve Turkish display names; prefer existing display when slug matches
  const city = citySlug
    ? displayCityName(citySlug, input.city ?? input.forcedCity ?? null)
    : ''
  const district = districtSlug
    ? displayDistrictName(districtSlug, input.district ?? input.forcedDistrict ?? null)
    : ''

  // Invalid compound → province-only (resolver already clears district)
  // UNRESOLVED with province kept as province-only for persist
  if (resolved.resolutionLevel === 'UNRESOLVED' && citySlug && !districtSlug) {
    return {
      city,
      citySlug,
      district: '',
      districtSlug: '',
      locality: resolved.localityDisplayName || locality || '',
      canonicalGeoId: null,
      geoResolutionLevel: 'PROVINCE_ONLY',
      geoResolutionSource: resolved.resolutionSource,
      metric: 'PROVINCE_ONLY',
    }
  }

  return {
    city,
    citySlug,
    district,
    districtSlug,
    locality: resolved.localityDisplayName || locality || '',
    canonicalGeoId: resolved.canonicalGeoId,
    geoResolutionLevel: resolved.resolutionLevel,
    geoResolutionSource: resolved.resolutionSource,
    metric: resolved.resolutionLevel,
  }
}

/** Idempotency helper — same inputs must produce same persist fields. */
export function canonicalGeoPersistFingerprint(
  r: FinalizeCanonicalArticleGeoResult
): string {
  return [
    r.citySlug,
    r.districtSlug,
    r.canonicalGeoId ?? '',
    normalizeGeoSlug(r.locality) ?? '',
    r.geoResolutionLevel,
  ].join('|')
}
