/**
 * Scoped RBAC helpers — additive on top of role→permission matrix.
 * When scopedRbac is off or grant has GLOBAL scope, behaves like classic hasPermission.
 */
import type { CmsPermission, CmsRole } from '@/types/cms'
import { hasPermission } from '@/types/cms'
import type { PermissionScope, ScopedPermissionGrant } from '@/types/newsroomOs'

export interface ResourceScopeContext {
  citySlug?: string | null
  districtSlug?: string | null
  categoryId?: string | null
  countryCode?: string | null
}

function scopeMatches(scope: PermissionScope, resource: ResourceScopeContext): boolean {
  if (scope.kind === 'GLOBAL') return true
  if (scope.kind === 'country') {
    return Boolean(scope.countryCode) && scope.countryCode === (resource.countryCode || 'TR')
  }
  if (scope.kind === 'city') {
    return Boolean(scope.citySlug) && scope.citySlug === resource.citySlug
  }
  if (scope.kind === 'district') {
    return (
      Boolean(scope.districtSlug) &&
      scope.districtSlug === resource.districtSlug &&
      (!scope.citySlug || scope.citySlug === resource.citySlug)
    )
  }
  if (scope.kind === 'category') {
    return Boolean(scope.categoryId) && scope.categoryId === resource.categoryId
  }
  return false
}

/** Super admin always passes. */
export function roleAllowsPermission(role: CmsRole, permission: CmsPermission): boolean {
  if (role === 'super_admin') return true
  return hasPermission(role, permission)
}

/**
 * Evaluate permission against optional scoped grants.
 * - No grants → fall back to role matrix (legacy).
 * - Grants present → must match permission AND at least one scope for the resource.
 */
export function canAccessResource(params: {
  role: CmsRole
  permission: CmsPermission
  grants?: ScopedPermissionGrant[] | null
  resource?: ResourceScopeContext | null
}): boolean {
  const { role, permission, grants, resource } = params
  if (role === 'super_admin') return true
  if (!roleAllowsPermission(role, permission)) return false

  if (!grants || grants.length === 0) return true

  const matching = grants.filter((g) => g.permission === permission)
  if (matching.length === 0) {
    // Role has permission but no scoped grant for it → allow (back-compat)
    return true
  }

  const ctx: ResourceScopeContext = resource ?? {}
  return matching.some((g) => {
    if (!g.scopes.length) return true
    return g.scopes.some((s) => scopeMatches(s, ctx))
  })
}

export function isGlobalGrant(grant: ScopedPermissionGrant): boolean {
  return grant.scopes.some((s) => s.kind === 'GLOBAL') || grant.scopes.length === 0
}

// ─── Human staff content scope (Phase 1 — Çanakkale pilot) ─────────────────────
//
// Stored on the existing staff identity document: Firestore `users/{uid}.cmsScope`
//   { provinceSlugs?: string[]; districtSlugs?: string[]; categoryIds?: string[] }
//
// Phase 2 (81-il hierarchy) adds the district dimension. Tiers:
//   province_general   { provinceSlugs:[p] }                              il genel editörü
//   province_category  { provinceSlugs:[p], categoryIds:[c] }             (Phase 1 shape)
//   district_general   { provinceSlugs:[p], districtSlugs:[d] }           ilçe genel editörü
//   district_category  { provinceSlugs:[p], districtSlugs:[d], categoryIds:[c] }
// A district scope needs EXACTLY one province and every district must belong to it
// (district slugs such as `merkez` repeat across provinces). District-scoped staff never
// see district-less (province-only) content — that belongs to the province editor.
//
// Semantics (deterministic, fail-closed):
// - `cmsScope` missing / null      → UNSCOPED legacy staff (current production behavior).
// - `cmsScope` present and valid   → SCOPED. Each non-empty dimension restricts; both
//                                     non-empty dimensions are evaluated as an
//                                     INTERSECTION (province AND category), never OR.
// - `cmsScope` present but invalid → INVALID → deny every scope-checked operation.
//   Invalid = not a plain object, a dimension that is not a string array, an unknown
//   province slug, a malformed category id, or BOTH dimensions empty (an explicit
//   scope that restricts nothing is treated as a mistake, not as "global").
// super_admin and env bootstrap admins are never scoped (resolved in cmsAuthServer).

export interface StaffContentScope {
  /** Canonical province slugs (e.g. `canakkale`). Empty = no province restriction. */
  provinceSlugs: string[]
  /** District slugs of the single scoped province (e.g. `merkez`). Empty = whole province. */
  districtSlugs: string[]
  /** Category ids (e.g. `spor`). Empty = no category restriction. */
  categoryIds: string[]
}

export type StaffScopeState =
  | { kind: 'unscoped' }
  | { kind: 'scoped'; scope: StaffContentScope }
  | { kind: 'invalid'; reason: string }

export const UNSCOPED_STAFF: StaffScopeState = Object.freeze({ kind: 'unscoped' }) as StaffScopeState

const CATEGORY_ID_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/
const DISTRICT_SLUG_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

function normalizeProvince(raw: string): string {
  return raw.trim().toLocaleLowerCase('en-US')
}

function normalizeCategory(raw: string): string {
  return raw.trim().toLocaleLowerCase('en-US')
}

function parseDimension(
  raw: unknown,
  normalize: (v: string) => string,
  isValid: (v: string) => boolean
): string[] | null {
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) return null
  const out: string[] = []
  for (const item of raw) {
    if (typeof item !== 'string') return null
    const v = normalize(item)
    if (!v || !isValid(v)) return null
    if (!out.includes(v)) out.push(v)
  }
  return out
}

/**
 * Parse `users/{uid}.cmsScope`. `isProvinceSlug` is injected so this module stays
 * free of the 81-il dataset import (callers pass `isTurkishProvinceSlug`).
 */
export function parseStaffScope(
  raw: unknown,
  isProvinceSlug: (slug: string) => boolean,
  /** Injected district→province check; absent → any district dimension is invalid. */
  isDistrictOfProvince?: (districtSlug: string, provinceSlug: string) => boolean
): StaffScopeState {
  if (raw === undefined || raw === null) return UNSCOPED_STAFF
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { kind: 'invalid', reason: 'scope_not_object' }
  }
  const obj = raw as Record<string, unknown>
  const provinceSlugs = parseDimension(
    obj.provinceSlugs,
    normalizeProvince,
    // Only canonical slugs are accepted: an alias that normalizes elsewhere is rejected.
    (v) => isProvinceSlug(v)
  )
  if (provinceSlugs === null) return { kind: 'invalid', reason: 'invalid_province_slugs' }
  const categoryIds = parseDimension(obj.categoryIds, normalizeCategory, (v) => CATEGORY_ID_RE.test(v))
  if (categoryIds === null) return { kind: 'invalid', reason: 'invalid_category_ids' }
  const districtSlugs = parseDimension(obj.districtSlugs, normalizeCategory, (v) => DISTRICT_SLUG_RE.test(v))
  if (districtSlugs === null) return { kind: 'invalid', reason: 'invalid_district_slugs' }
  if (districtSlugs.length > 0) {
    if (provinceSlugs.length !== 1) return { kind: 'invalid', reason: 'district_requires_single_province' }
    const province = provinceSlugs[0]!
    if (!isDistrictOfProvince || !districtSlugs.every((d) => isDistrictOfProvince(d, province))) {
      return { kind: 'invalid', reason: 'district_not_in_province' }
    }
  }
  if (provinceSlugs.length === 0 && categoryIds.length === 0) {
    return { kind: 'invalid', reason: 'empty_scope' }
  }
  return { kind: 'scoped', scope: { provinceSlugs, districtSlugs, categoryIds } }
}

/** True when the identity carries any scope restriction (including invalid → deny). */
export function isScopeRestricted(state: StaffScopeState): boolean {
  return state.kind !== 'unscoped'
}

/** Province dimension only (empty province list = unrestricted on this dimension). */
export function canAccessProvince(state: StaffScopeState, provinceSlug: string | null | undefined): boolean {
  if (state.kind === 'unscoped') return true
  if (state.kind === 'invalid') return false
  const { provinceSlugs } = state.scope
  if (provinceSlugs.length === 0) return true
  const slug = typeof provinceSlug === 'string' ? normalizeProvince(provinceSlug) : ''
  return Boolean(slug) && provinceSlugs.includes(slug)
}

/** Category dimension only (empty category list = unrestricted on this dimension). */
export function canAccessCategory(state: StaffScopeState, categoryId: string | null | undefined): boolean {
  if (state.kind === 'unscoped') return true
  if (state.kind === 'invalid') return false
  const { categoryIds } = state.scope
  if (categoryIds.length === 0) return true
  const id = typeof categoryId === 'string' ? normalizeCategory(categoryId) : ''
  return Boolean(id) && categoryIds.includes(id)
}

/**
 * District dimension (empty = whole province). District-scoped staff never pass on
 * district-less content; the province check must pass as well (slugs repeat across il).
 */
export function canAccessDistrict(state: StaffScopeState, districtSlug: string | null | undefined): boolean {
  if (state.kind === 'unscoped') return true
  if (state.kind === 'invalid') return false
  const { districtSlugs } = state.scope
  if (districtSlugs.length === 0) return true
  const slug = typeof districtSlug === 'string' ? normalizeCategory(districtSlug) : ''
  return Boolean(slug) && districtSlugs.includes(slug)
}

/** Content check: province AND district AND category (intersection). */
export function canAccessContentScope(
  state: StaffScopeState,
  resource: ResourceScopeContext | null | undefined
): boolean {
  if (state.kind === 'unscoped') return true
  if (state.kind === 'invalid') return false
  const ctx = resource ?? {}
  return (
    canAccessProvince(state, ctx.citySlug) &&
    canAccessDistrict(state, ctx.districtSlug) &&
    canAccessCategory(state, ctx.categoryId)
  )
}

export type StaffTier =
  | 'unscoped'
  | 'invalid'
  | 'province_general'
  | 'province_category'
  | 'district_general'
  | 'district_category'
  /** Any other valid shape (multi-province, category-only) — legacy, never assignable. */
  | 'custom'

/** Classify a scope into the Phase 2 hierarchy tier. */
export function staffTierOf(state: StaffScopeState): StaffTier {
  if (state.kind !== 'scoped') return state.kind
  const { provinceSlugs, districtSlugs, categoryIds } = state.scope
  if (provinceSlugs.length !== 1) return 'custom'
  if (districtSlugs.length === 0) {
    if (categoryIds.length === 0) return 'province_general'
    return categoryIds.length === 1 ? 'province_category' : 'custom'
  }
  if (districtSlugs.length !== 1) return 'custom'
  if (categoryIds.length === 0) return 'district_general'
  return categoryIds.length === 1 ? 'district_category' : 'custom'
}

/**
 * City settings are a province-level administrative surface: only unscoped staff or
 * province-scoped staff WITHOUT a category restriction for that exact province.
 */
export function canManageProvinceSettings(state: StaffScopeState, provinceSlug: string | null | undefined): boolean {
  if (state.kind === 'unscoped') return true
  if (state.kind === 'invalid') return false
  if (state.scope.categoryIds.length > 0) return false
  if (state.scope.districtSlugs.length > 0) return false
  if (state.scope.provinceSlugs.length === 0) return false
  const slug = typeof provinceSlug === 'string' ? normalizeProvince(provinceSlug) : ''
  return Boolean(slug) && state.scope.provinceSlugs.includes(slug)
}

/** Read the scope-relevant fields of a Firestore news / draft document. */
export function contentScopeOf(data: Record<string, unknown> | null | undefined): ResourceScopeContext {
  const d = data ?? {}
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  return {
    citySlug: str(d.citySlug),
    districtSlug: str(d.districtSlug),
    categoryId: str(d.categoryId) || str(d.category),
  }
}
