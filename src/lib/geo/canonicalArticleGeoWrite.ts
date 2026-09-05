/**
 * Canonical article geo write boundary.
 *
 * All CMS / human / draft publish paths that mutate geography must go through
 * this helper so top-level fields, location, and canonicalGeoId stay atomic.
 *
 * Reuses finalizeCanonicalArticleGeo — does not invent a second resolver.
 */
import { getDistrictsForProvince } from '@/constants/cities'
import {
  finalizeCanonicalArticleGeo,
  type FinalizeCanonicalArticleGeoResult,
} from '@/lib/geo/finalizeCanonicalArticleGeo'
import { normalizeGeoSlug } from '@/lib/geo/normalizeGeoSlug'

export type ArticleLocation = {
  city?: string
  district?: string
  country: string
  lat: number
  lng: number
}

/** Complete persisted geo identity (top-level + location + metadata). */
export type CanonicalArticleGeoWriteState = {
  city: string
  citySlug: string
  district: string
  districtSlug: string
  locality: string
  canonicalGeoId: string | null
  geoResolutionLevel: string
  geoResolutionSource: string
  location: ArticleLocation | null
  country: string
  countrySlug: string
}

/** Existing document geo snapshot. */
export type ExistingCanonicalArticleGeo = {
  city?: string | null
  citySlug?: string | null
  district?: string | null
  districtSlug?: string | null
  locality?: string | null
  canonicalGeoId?: string | null
  geoResolutionLevel?: string | null
  geoResolutionSource?: string | null
  location?: ArticleLocation | null
  country?: string | null
  countrySlug?: string | null
}

/**
 * PATCH geo fields. Presence of a key means the client sent that field
 * (including empty string / null = explicit clear). Omitted keys are preserved.
 */
export type CanonicalArticleGeoPatch = {
  city?: string | null
  citySlug?: string | null
  district?: string | null
  districtSlug?: string | null
  locality?: string | null
  location?: ArticleLocation | null
  country?: string | null
  countrySlug?: string | null
  articleIsAbroad?: boolean
}

export type ApplyCanonicalArticleGeoWriteOptions = {
  /** Human/editorial lock — forced selections win inside finalize. */
  editorialGeoLocked?: boolean
  articleIsAbroad?: boolean
  /**
   * When true, if the client supplied both a non-empty province and district
   * that do not form a valid compound, return an error instead of silently
   * dropping the district (CMS create/update).
   */
  rejectInvalidCompound?: boolean
}

export type ApplyCanonicalArticleGeoWriteResult =
  | { ok: true; state: CanonicalArticleGeoWriteState; changed: true }
  | { ok: true; state: CanonicalArticleGeoWriteState; changed: false }
  | { ok: false; error: string; code: 'INVALID_COMPOUND_GEO' }

const GEO_PATCH_KEYS = [
  'city',
  'citySlug',
  'district',
  'districtSlug',
  'locality',
  'location',
  'country',
  'countrySlug',
] as const

export function geoPatchTouchesIdentity(
  patch: CanonicalArticleGeoPatch | null | undefined
): boolean {
  if (!patch) return false
  return GEO_PATCH_KEYS.some((k) => Object.prototype.hasOwnProperty.call(patch, k))
}

function asTrim(v: string | null | undefined): string {
  return (v ?? '').trim()
}

function districtValidInProvince(provinceSlug: string, districtSlug: string): boolean {
  return getDistrictsForProvince(provinceSlug).some((d) => d.slug === districtSlug)
}

function readExisting(existing: ExistingCanonicalArticleGeo): CanonicalArticleGeoWriteState {
  const citySlug = asTrim(existing.citySlug)
  const districtSlug = asTrim(existing.districtSlug)
  const city = asTrim(existing.city)
  const district = asTrim(existing.district)
  const locality = asTrim(existing.locality)
  const country = asTrim(existing.country) || 'Türkiye'
  const countrySlug = asTrim(existing.countrySlug)
  const loc = existing.location
  return {
    city,
    citySlug,
    district,
    districtSlug,
    locality,
    canonicalGeoId: existing.canonicalGeoId?.trim() || null,
    geoResolutionLevel: asTrim(existing.geoResolutionLevel) || 'NONE',
    geoResolutionSource: asTrim(existing.geoResolutionSource) || 'none',
    location: loc
      ? {
          city: asTrim(loc.city),
          ...(asTrim(loc.district) ? { district: asTrim(loc.district) } : {}),
          country: asTrim(loc.country) || country,
          lat: typeof loc.lat === 'number' ? loc.lat : 0,
          lng: typeof loc.lng === 'number' ? loc.lng : 0,
        }
      : citySlug || city
        ? {
            city: city || citySlug,
            ...(district ? { district } : {}),
            country,
            lat: 0,
            lng: 0,
          }
        : null,
    country,
    countrySlug,
  }
}

/**
 * Merge PATCH onto existing. Omitted fields keep existing values.
 * Explicit empty clears.
 *
 * If citySlug changes and districtSlug was omitted, drop district when it is
 * no longer valid under the new province (prevents cross-province residue).
 */
export function mergeCanonicalArticleGeoPatch(
  existing: ExistingCanonicalArticleGeo,
  patch: CanonicalArticleGeoPatch
): {
  intended: {
    city: string
    citySlug: string
    district: string
    districtSlug: string
    locality: string
    country: string
    countrySlug: string
    articleIsAbroad: boolean
  }
  suppliedCompound: boolean
} {
  const base = readExisting(existing)
  const has = (k: keyof CanonicalArticleGeoPatch) =>
    Object.prototype.hasOwnProperty.call(patch, k)

  let city = has('city') ? asTrim(patch.city) : base.city
  let citySlug = has('citySlug') ? asTrim(patch.citySlug) : base.citySlug
  let district = has('district') ? asTrim(patch.district) : base.district
  let districtSlug = has('districtSlug') ? asTrim(patch.districtSlug) : base.districtSlug
  let locality = has('locality') ? asTrim(patch.locality) : base.locality
  let country = has('country') ? asTrim(patch.country) || 'Türkiye' : base.country
  let countrySlug = has('countrySlug') ? asTrim(patch.countrySlug) : base.countrySlug

  if (has('location') && patch.location) {
    if (!has('city') && asTrim(patch.location.city)) city = asTrim(patch.location.city)
    if (!has('district') && asTrim(patch.location.district)) {
      district = asTrim(patch.location.district)
    }
    if (!has('country') && asTrim(patch.location.country)) {
      country = asTrim(patch.location.country)
    }
  }

  // Abroad: countrySlug set and no domestic citySlug
  const articleIsAbroad = Boolean(
    patch.articleIsAbroad ??
      (countrySlug && !citySlug && country && country !== 'Türkiye')
  )

  const citySlugChanged =
    has('citySlug') && normalizeGeoSlug(citySlug) !== normalizeGeoSlug(base.citySlug)
  if (citySlugChanged && !has('districtSlug') && !has('district')) {
    const newProv = normalizeGeoSlug(citySlug)
    const oldDist = normalizeGeoSlug(districtSlug)
    if (newProv && oldDist && !districtValidInProvince(newProv, oldDist)) {
      district = ''
      districtSlug = ''
      locality = ''
    }
  }

  // Explicit clear of province clears district identity
  if (has('citySlug') && !citySlug && !has('districtSlug')) {
    district = ''
    districtSlug = ''
  }

  const suppliedCompound =
    Boolean(normalizeGeoSlug(citySlug)) && Boolean(normalizeGeoSlug(districtSlug)) &&
    (has('citySlug') || has('districtSlug') || has('city') || has('district'))

  return {
    intended: {
      city,
      citySlug,
      district,
      districtSlug,
      locality,
      country,
      countrySlug,
      articleIsAbroad,
    },
    suppliedCompound,
  }
}

function toWriteState(
  finalized: FinalizeCanonicalArticleGeoResult,
  country: string,
  countrySlug: string,
  articleIsAbroad: boolean
): CanonicalArticleGeoWriteState {
  if (articleIsAbroad) {
    return {
      city: '',
      citySlug: '',
      district: '',
      districtSlug: '',
      locality: '',
      canonicalGeoId: null,
      geoResolutionLevel: 'NONE',
      geoResolutionSource: 'none',
      location: {
        city: '',
        country: country || countrySlug || '',
        lat: 0,
        lng: 0,
      },
      country: country || countrySlug || '',
      countrySlug: countrySlug || '',
    }
  }

  const city = finalized.city
  const citySlug = finalized.citySlug
  const district = finalized.district
  const districtSlug = finalized.districtSlug
  const hasDomestic = Boolean(citySlug || city)

  return {
    city,
    citySlug,
    district,
    districtSlug,
    locality: finalized.locality,
    canonicalGeoId: finalized.canonicalGeoId,
    geoResolutionLevel: finalized.geoResolutionLevel,
    geoResolutionSource: finalized.geoResolutionSource,
    location: hasDomestic
      ? {
          city: city || citySlug,
          ...(district ? { district } : {}),
          country: country || 'Türkiye',
          lat: 0,
          lng: 0,
        }
      : null,
    country: hasDomestic ? country || 'Türkiye' : country,
    countrySlug: hasDomestic ? '' : countrySlug,
  }
}

/** Same canonical identity (slugs + geoId + locality); ignores display casing / coords. */
function sameCanonicalIdentity(
  a: CanonicalArticleGeoWriteState,
  b: CanonicalArticleGeoWriteState
): boolean {
  return (
    normalizeGeoSlug(a.citySlug) === normalizeGeoSlug(b.citySlug) &&
    normalizeGeoSlug(a.districtSlug) === normalizeGeoSlug(b.districtSlug) &&
    normalizeGeoSlug(a.locality) === normalizeGeoSlug(b.locality) &&
    (a.canonicalGeoId?.trim() || null) === (b.canonicalGeoId?.trim() || null) &&
    (a.geoResolutionLevel || 'NONE') === (b.geoResolutionLevel || 'NONE')
  )
}

/**
 * Apply a geo PATCH (or full create payload) and produce an atomic write state.
 * When patch does not touch geo identity fields, returns existing unchanged.
 *
 * Idempotent: Admin editors often re-send citySlug on every save. If the
 * document is already consistent and the intended identity matches, do not
 * rewrite (preserves location lat/lng and headline-only semantics).
 */
export function applyCanonicalArticleGeoWrite(
  existing: ExistingCanonicalArticleGeo,
  patch: CanonicalArticleGeoPatch | null | undefined,
  options: ApplyCanonicalArticleGeoWriteOptions = {}
): ApplyCanonicalArticleGeoWriteResult {
  if (!geoPatchTouchesIdentity(patch)) {
    return { ok: true, state: readExisting(existing), changed: false }
  }

  const before = readExisting(existing)
  const { intended, suppliedCompound } = mergeCanonicalArticleGeoPatch(existing, patch!)
  const articleIsAbroad = Boolean(options.articleIsAbroad ?? intended.articleIsAbroad)

  const finalized = finalizeCanonicalArticleGeo({
    articleIsAbroad,
    editorialGeoLocked: Boolean(options.editorialGeoLocked),
    city: intended.city,
    citySlug: intended.citySlug,
    district: intended.district,
    districtSlug: intended.districtSlug,
    locality: intended.locality,
    forcedCity: options.editorialGeoLocked ? intended.city : undefined,
    forcedCitySlug: options.editorialGeoLocked ? intended.citySlug : undefined,
    forcedDistrict: options.editorialGeoLocked ? intended.district || null : undefined,
    forcedLocality: options.editorialGeoLocked ? intended.locality || null : undefined,
  })

  // CMS: explicit invalid compound (e.g. canakkale+gonen) → reject.
  // Verified localities (Side→Manavgat) survive finalize with a districtSlug.
  if (
    options.rejectInvalidCompound &&
    suppliedCompound &&
    !articleIsAbroad
  ) {
    const suppliedDist = normalizeGeoSlug(intended.districtSlug || intended.district)
    if (suppliedDist && !finalized.districtSlug) {
      const prov = normalizeGeoSlug(intended.citySlug || intended.city) || 'unknown'
      return {
        ok: false,
        code: 'INVALID_COMPOUND_GEO',
        error: `Geçersiz il/ilçe çifti: ${prov} + ${suppliedDist}`,
      }
    }
  }

  // Explicit full clear
  const cleared =
    !intended.citySlug &&
    !intended.city &&
    !intended.districtSlug &&
    !intended.district &&
    !intended.locality

  if (cleared && !articleIsAbroad) {
    const alreadyClear =
      !before.citySlug &&
      !before.city &&
      !before.districtSlug &&
      !before.district &&
      !before.locality &&
      !before.canonicalGeoId
    if (alreadyClear) {
      return { ok: true, state: before, changed: false }
    }
    return {
      ok: true,
      changed: true,
      state: {
        city: '',
        citySlug: '',
        district: '',
        districtSlug: '',
        locality: '',
        canonicalGeoId: null,
        geoResolutionLevel: 'NONE',
        geoResolutionSource: 'none',
        location: null,
        country: intended.country || 'Türkiye',
        countrySlug: intended.countrySlug || '',
      },
    }
  }

  const next = toWriteState(finalized, intended.country, intended.countrySlug, articleIsAbroad)

  // Preserve coords when identity is unchanged and document was already consistent.
  // Heal contradictions even when top-level citySlug is re-sent unchanged.
  if (
    canonicalGeoIdentityConsistent(before) &&
    sameCanonicalIdentity(before, next) &&
    locationIdentityAgrees(before)
  ) {
    return { ok: true, state: before, changed: false }
  }

  // Keep existing lat/lng when domestic identity city/district match.
  if (
    next.location &&
    before.location &&
    normalizeGeoSlug(next.citySlug) === normalizeGeoSlug(before.citySlug) &&
    normalizeGeoSlug(next.districtSlug) === normalizeGeoSlug(before.districtSlug)
  ) {
    next.location = {
      ...next.location,
      lat: before.location.lat,
      lng: before.location.lng,
    }
  }

  return {
    ok: true,
    changed: true,
    state: next,
  }
}

/** location.city/district agree with top-level identity (or location absent). */
function locationIdentityAgrees(state: CanonicalArticleGeoWriteState): boolean {
  if (!state.location) return !state.citySlug && !state.city
  const locCity = normalizeGeoSlug(state.location.city)
  const locDist = normalizeGeoSlug(state.location.district)
  const topCity = normalizeGeoSlug(state.citySlug || state.city)
  const topDist = normalizeGeoSlug(state.districtSlug || state.district)
  if (topCity && locCity && locCity !== topCity) return false
  if (topDist && locDist && locDist !== topDist) return false
  if (!topDist && locDist) return false
  return true
}

/** Firestore/PG field map from a finalized write state (omit empty optionals as ''). */
export function canonicalArticleGeoToPersistFields(
  state: CanonicalArticleGeoWriteState
): Record<string, unknown> {
  return {
    city: state.city,
    citySlug: state.citySlug,
    district: state.district,
    districtSlug: state.districtSlug,
    locality: state.locality || '',
    canonicalGeoId: state.canonicalGeoId,
    geoResolutionLevel: state.geoResolutionLevel,
    geoResolutionSource: state.geoResolutionSource,
    location: state.location,
    country: state.country,
    countrySlug: state.countrySlug,
  }
}

/** Invariant check used by tests / dry-run. */
export function canonicalGeoIdentityConsistent(state: {
  citySlug?: string | null
  districtSlug?: string | null
  canonicalGeoId?: string | null
}): boolean {
  const id = state.canonicalGeoId?.trim()
  if (!id) return true
  const m = /^TR:([a-z0-9-]+):([a-z0-9-]+)$/i.exec(id)
  if (!m) return false
  const prov = m[1]!.toLowerCase()
  const dist = m[2]!.toLowerCase()
  return (
    normalizeGeoSlug(state.citySlug) === prov &&
    normalizeGeoSlug(state.districtSlug) === dist
  )
}
