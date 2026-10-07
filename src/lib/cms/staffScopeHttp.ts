/**
 * Server-side staff scope enforcement for CMS API routes (Phase 1 — Çanakkale pilot).
 * Thin HTTP layer over the pure helpers in `rbacScope.ts`; routes must not re-implement
 * scope logic. Fail-closed: any doubt → 403.
 */
import 'server-only'
import { NextResponse } from 'next/server'
import {
  canAccessContentScope,
  canManageProvinceSettings,
  contentScopeOf,
  hasStaffRight,
  isScopeRestricted,
  type ResourceScopeContext,
  type StaffScopeState,
} from '@/lib/cms/rbacScope'

export const STAFF_SCOPE_FORBIDDEN_ERROR = 'Bu işlem yetki kapsamınız (il/ilçe/kategori) dışında'

import { STAFF_RIGHT_LABELS, type StaffRight } from '@/lib/cms/staffRights'

export function staffRightForbidden(right: StaffRight): NextResponse {
  return NextResponse.json(
    { error: `Bu işlem için "${STAFF_RIGHT_LABELS[right]}" yetkiniz yok`, code: 'STAFF_RIGHT_MISSING', right },
    { status: 403 }
  )
}

/**
 * Phase 2D: every required right must be held on EVERY resource state (before/after).
 * Unscoped staff and legacy scoped shapes hold all rights inside their scope.
 */
export function denyIfMissingStaffRights(
  auth: { scope: StaffScopeState },
  rights: Iterable<StaffRight>,
  ...resources: Array<ResourceScopeContext | null | undefined>
): NextResponse | null {
  if (!isScopeRestricted(auth.scope)) return null
  for (const right of rights) {
    for (const r of resources) {
      if (!hasStaffRight(auth.scope, r, right)) return staffRightForbidden(right)
    }
  }
  return null
}

export function staffScopeForbidden(): NextResponse {
  return NextResponse.json({ error: STAFF_SCOPE_FORBIDDEN_ERROR, code: 'STAFF_SCOPE_FORBIDDEN' }, { status: 403 })
}

/**
 * Every resource state passed (e.g. BEFORE and AFTER an update) must be inside scope.
 * Unscoped staff always pass. Returns a 403 response or null.
 */
export function denyIfOutsideStaffScope(
  auth: { scope: StaffScopeState },
  ...resources: Array<ResourceScopeContext | null | undefined>
): NextResponse | null {
  if (!isScopeRestricted(auth.scope)) return null
  if (resources.length === 0) return staffScopeForbidden()
  for (const r of resources) {
    if (!canAccessContentScope(auth.scope, r)) return staffScopeForbidden()
  }
  return null
}

/** City settings (cityOpsSettings) — province administrators only. */
export function denyIfCannotManageProvince(
  auth: { scope: StaffScopeState },
  provinceSlug: string | null | undefined
): NextResponse | null {
  if (!isScopeRestricted(auth.scope)) return null
  return canManageProvinceSettings(auth.scope, provinceSlug) ? null : staffScopeForbidden()
}

/**
 * Phase 2: load `collection/id` with the Admin SDK and deny when a scoped actor is
 * outside the document's province/district/category. Unscoped staff always pass.
 * Returns a NextResponse (403/404) or null.
 */
export async function denyIfDocOutsideStaffScope(
  auth: { scope: StaffScopeState },
  collectionName: string,
  id: string,
  requiredRight?: StaffRight
): Promise<NextResponse | null> {
  if (!isScopeRestricted(auth.scope)) return null
  const { getAdminFirestore } = await import('@/lib/firebase/admin')
  const snap = await getAdminFirestore().collection(collectionName).doc(id).get()
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const ctx = contentScopeOf(snap.data() as Record<string, unknown>)
  if (!canAccessContentScope(auth.scope, ctx)) return staffScopeForbidden()
  if (requiredRight && !hasStaffRight(auth.scope, ctx, requiredRight)) return staffRightForbidden(requiredRight)
  return null
}
