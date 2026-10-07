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
  isScopeRestricted,
  type ResourceScopeContext,
  type StaffScopeState,
} from '@/lib/cms/rbacScope'

export const STAFF_SCOPE_FORBIDDEN_ERROR = 'Bu işlem yetki kapsamınız (il/ilçe/kategori) dışında'

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
  id: string
): Promise<NextResponse | null> {
  if (!isScopeRestricted(auth.scope)) return null
  const { getAdminFirestore } = await import('@/lib/firebase/admin')
  const snap = await getAdminFirestore().collection(collectionName).doc(id).get()
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return canAccessContentScope(auth.scope, contentScopeOf(snap.data() as Record<string, unknown>))
    ? null
    : staffScopeForbidden()
}
