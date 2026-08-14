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
