import { isTurkishProvinceSlug, normalizeCitySlug } from '@/constants/cities'
import type { FeedMode, FeedUserContext } from '@/types/smartFeed'

export const CITY_INTEREST_PREFIX = 'city:'
/** ~2+ qualified reads after aggregator /5 normalization. */
export const FOREIGN_CITY_ALLOW_MIN_SCORE = 0.35
/** Learned home city only when one locality clearly dominates. */
export const HOME_CITY_LEARN_MIN_SCORE = 0.4
export const MAX_EXTRA_LOCAL_CITIES = 2

export type PersonalLocalScope = {
  homeCity: string | null
  extraCities: ReadonlySet<string>
  affinities: ReadonlyMap<string, number>
}

export function cityInterestKey(slug: string): string {
  return `${CITY_INTEREST_PREFIX}${normalizeCitySlug(slug)}`.slice(0, 64)
}

export function normalizeKnownCitySlug(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  const slug = normalizeCitySlug(trimmed)
  if (!slug) return null
  return isTurkishProvinceSlug(slug) ? slug : null
}

export function parseCityAffinities(
  behavioralInterests: ReadonlyMap<string, number>
): Map<string, number> {
  const out = new Map<string, number>()
  for (const [key, score] of behavioralInterests) {
    if (!key.startsWith(CITY_INTEREST_PREFIX)) continue
    const slug = normalizeKnownCitySlug(key.slice(CITY_INTEREST_PREFIX.length))
    if (!slug || !Number.isFinite(score) || score <= 0) continue
    out.set(slug, Math.min(1, Math.max(out.get(slug) ?? 0, score)))
  }
  return out
}

export function resolveHomeCity(opts: {
  profileCity?: string | null
  requestCity?: string | null
  affinities?: ReadonlyMap<string, number>
}): string | null {
  const profile = normalizeKnownCitySlug(opts.profileCity)
  if (profile) return profile
  const request = normalizeKnownCitySlug(opts.requestCity)
  if (request) return request

  let bestSlug: string | null = null
  let bestScore = 0
  for (const [slug, score] of opts.affinities ?? []) {
    if (score > bestScore) {
      bestScore = score
      bestSlug = slug
    }
  }
  if (bestSlug && bestScore >= HOME_CITY_LEARN_MIN_SCORE) return bestSlug
  return null
}

export function extraAllowedLocalCities(
  homeCity: string | null,
  affinities: ReadonlyMap<string, number>,
  limit = MAX_EXTRA_LOCAL_CITIES
): string[] {
  return [...affinities.entries()]
    .filter(([slug, score]) => slug !== homeCity && score >= FOREIGN_CITY_ALLOW_MIN_SCORE)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, limit))
    .map(([slug]) => slug)
}

export function personalLocalScopeFromContext(
  ctx: Pick<FeedUserContext, 'city' | 'behavioralInterests'>,
  requestCity?: string | null
): PersonalLocalScope {
  const affinities = parseCityAffinities(ctx.behavioralInterests)
  const homeCity = resolveHomeCity({
    profileCity: ctx.city,
    requestCity,
    affinities,
  })
  return {
    homeCity,
    extraCities: new Set(extraAllowedLocalCities(homeCity, affinities)),
    affinities,
  }
}

export function applyPersonalLocationToContext(
  ctx: FeedUserContext,
  requestCity?: string | null,
  requestDistrict?: string | null
): FeedUserContext {
  const scope = personalLocalScopeFromContext(ctx, requestCity)
  const district = ctx.districtSlug || requestDistrict?.trim().toLowerCase() || null
  return {
    ...ctx,
    city: scope.homeCity,
    districtSlug: district,
  }
}

export function cityAffinity(scope: PersonalLocalScope, citySlug: string | null | undefined): number {
  const slug = normalizeKnownCitySlug(citySlug)
  if (!slug) return 0
  return scope.affinities.get(slug) ?? 0
}

/**
 * True local inventory only. National news often keeps a citySlug for routing
 * ("konum yalnızca geçiyor") and must not be treated as another city's local.
 */
export function isCityLocalArticle(row: {
  citySlug?: string | null
  category?: string | null
  source?: string | null
  candidateSources?: readonly string[] | null
}): boolean {
  if (!normalizeKnownCitySlug(row.citySlug)) return false
  const cat = (row.category ?? '').trim().toLowerCase()
  if (cat === 'yerel' || cat.startsWith('yerel-')) return true
  const sources = row.candidateSources?.length
    ? row.candidateSources
    : row.source
      ? [row.source]
      : []
  return sources.includes('LOCAL')
}

/** National / world stay. Foreign true-locals enter only after real reads. */
export function isPersonalLocalAllowed(
  row: {
    citySlug?: string | null
    category?: string | null
    source?: string | null
    candidateSources?: readonly string[] | null
  },
  scope: PersonalLocalScope
): boolean {
  if (!isCityLocalArticle(row)) return true
  const rowCity = normalizeKnownCitySlug(row.citySlug)
  if (!rowCity) return true
  if (scope.homeCity && rowCity === scope.homeCity) return true
  return scope.extraCities.has(rowCity)
}

export function filterPersonalLocalInventory<T extends { citySlug?: string | null }>(
  rows: T[],
  mode: FeedMode,
  scope: PersonalLocalScope
): T[] {
  if (mode !== 'personal') return rows
  return rows.filter((row) => isPersonalLocalAllowed(row, scope))
}
