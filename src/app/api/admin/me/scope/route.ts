/**
 * GET /api/admin/me/scope — the caller's CMS role + Phase 2 hierarchy position.
 * The admin shell uses it to switch scoped editors to server-side lists and to
 * limit navigation to their own section.
 */
import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { allStaffRights, staffTierOf } from '@/lib/cms/rbacScope'
import { canManageProvinceStaff } from '@/lib/cms/staffHierarchy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, undefined, { scopeAware: true })
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const tier = staffTierOf(auth.scope)
  const scope = auth.scope.kind === 'scoped' ? auth.scope.scope : null
  const provinceSlug = scope?.provinceSlugs.length === 1 ? scope.provinceSlugs[0]! : null
  return NextResponse.json({
    role: auth.role,
    scoped: auth.scope.kind !== 'unscoped',
    tier,
    provinceSlug,
    districtSlug: scope?.districtSlugs[0] ?? null,
    categoryId: scope?.categoryIds[0] ?? null,
    canManageStaff: provinceSlug ? canManageProvinceStaff(auth, provinceSlug) : auth.role === 'super_admin',
    /** Phase 2D: rights held in at least one section (UI gating; server re-checks). */
    rights: allStaffRights(auth.scope),
    sections: scope?.sections ?? null,
  })
}
