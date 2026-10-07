/**
 * Phase 2 — 81-il staff hierarchy: list / assign / revoke scoped editors.
 *
 * GET  /api/admin/staff/assignments?province=canakkale
 * POST /api/admin/staff/assignments
 *      { action: 'assign', targetUid, tier, provinceSlug, districtSlug?, categoryId? }
 *      { action: 'revoke', targetUid }
 *
 * Authority (src/lib/cms/staffHierarchy.ts): super_admin → every tier;
 * il genel editörü → district tiers inside its own province. Writes go through the
 * Admin SDK in a transaction (role + cmsScope together) and leave an audit record in
 * `staffScopeAudit` (no client access: unmatched path → denied by firestore.rules).
 */
import { NextResponse } from 'next/server'
import { FieldValue } from 'firebase-admin/firestore'
import {
  isDistrictOfProvince,
  resolveStaffScopeFromUserData,
  verifyCmsToken,
} from '@/lib/cmsAuthServer'
import { getAdminAuth, getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getBootstrapAdminUids, isSuperAdminEmailServer } from '@/lib/cmsSecrets.server'
import { resolveCmsRoleFromFirestore } from '@/lib/cmsRoleUtils'
import { isTurkishProvinceSlug, normalizeCitySlug } from '@/constants/cities'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { staffTierOf, type StaffScopeState } from '@/lib/cms/rbacScope'
import {
  ASSIGNABLE_TIERS,
  buildAssignment,
  canAssign,
  canManageProvinceStaff,
  canRevoke,
  type AssignableTier,
  type HierarchyDeps,
  type StaffIdentity,
} from '@/lib/cms/staffHierarchy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const AUDIT_COLLECTION = 'staffScopeAudit'
const UID_RE = /^[A-Za-z0-9_-]{1,128}$/

const deps: HierarchyDeps = {
  isProvinceSlug: (s) => isTurkishProvinceSlug(s) && normalizeCitySlug(s) === s,
  isDistrictOfProvince,
  isKnownCategory: (id) => DEFAULT_CATEGORIES.some((c) => c.id === id),
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

function scopeSummary(state: StaffScopeState) {
  if (state.kind !== 'scoped') return { tier: staffTierOf(state) }
  const { provinceSlugs, districtSlugs, categoryIds } = state.scope
  return {
    tier: staffTierOf(state),
    provinceSlug: provinceSlugs[0] ?? null,
    districtSlug: districtSlugs[0] ?? null,
    categoryId: categoryIds[0] ?? null,
  }
}

/** Resolve the TARGET exactly like verifyCmsToken resolves an actor (exact UID). */
async function resolveTargetIdentity(
  uid: string,
  userData: Record<string, unknown> | undefined
): Promise<StaffIdentity> {
  if (getBootstrapAdminUids().includes(uid)) {
    // Env bootstrap admins are global by construction — never re-scoped here.
    return { uid, role: 'super_admin', scope: { kind: 'unscoped' } }
  }
  const authUser = await getAdminAuth().getUser(uid).catch(() => null)
  if (isSuperAdminEmailServer(authUser?.email)) {
    return { uid, role: 'super_admin', scope: { kind: 'unscoped' } }
  }
  const role = resolveCmsRoleFromFirestore(userData?.role as string | undefined)
  return { uid, role, scope: resolveStaffScopeFromUserData(role, userData) }
}

export async function GET(request: Request) {
  const auth = await verifyCmsToken(request, undefined, { scopeAware: true })
  if (!auth) return json({ error: 'Unauthorized' }, 401)
  const province = new URL(request.url).searchParams.get('province')?.trim() ?? ''
  if (!deps.isProvinceSlug(province)) return json({ error: 'Geçersiz il' }, 400)
  if (!canManageProvinceStaff(auth, province)) return json({ error: 'Forbidden', code: 'STAFF_SCOPE_FORBIDDEN' }, 403)

  // Exact username lookup (public profile handle) to pick an assignee.
  const lookup = new URL(request.url).searchParams.get('lookup')?.trim() ?? ''
  if (lookup) {
    const hit = await getAdminFirestore().collection(Collections.USERS).where('username', '==', lookup).limit(2).get()
    if (hit.docs.length !== 1) return json({ user: null })
    const d = hit.docs[0]!
    const data = d.data() as Record<string, unknown>
    const role = resolveCmsRoleFromFirestore(data.role as string | undefined)
    return json({
      user: {
        uid: d.id,
        username: data.username ?? null,
        displayName: typeof data.displayName === 'string' ? data.displayName : null,
        role,
        ...scopeSummary(resolveStaffScopeFromUserData(role, data)),
      },
    })
  }

  const snap = await getAdminFirestore()
    .collection(Collections.USERS)
    .where('cmsScope.provinceSlugs', 'array-contains', province)
    .limit(500)
    .get()
  const staff = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    const role = resolveCmsRoleFromFirestore(data.role as string | undefined)
    return {
      uid: d.id,
      username: typeof data.username === 'string' ? data.username : null,
      displayName: typeof data.displayName === 'string' ? data.displayName : null,
      role,
      ...scopeSummary(resolveStaffScopeFromUserData(role, data)),
    }
  })
  return json({ province, staff })
}

export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, undefined, { scopeAware: true })
  if (!auth) return json({ error: 'Unauthorized' }, 401)
  const actor: StaffIdentity = { uid: auth.uid, role: auth.role, scope: auth.scope }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return json({ error: 'Geçersiz istek' }, 400)
  const action = body.action
  const targetUid = typeof body.targetUid === 'string' ? body.targetUid.trim() : ''
  if (action !== 'assign' && action !== 'revoke') return json({ error: 'Geçersiz işlem' }, 400)
  if (!UID_RE.test(targetUid)) return json({ error: 'Geçersiz kullanıcı' }, 400)

  let built: ReturnType<typeof buildAssignment> | null = null
  if (action === 'assign') {
    const tier = body.tier as AssignableTier
    if (!ASSIGNABLE_TIERS.includes(tier)) return json({ error: 'Geçersiz editör seviyesi' }, 400)
    built = buildAssignment(
      {
        tier,
        provinceSlug: String(body.provinceSlug ?? ''),
        districtSlug: typeof body.districtSlug === 'string' ? body.districtSlug : null,
        categoryId: typeof body.categoryId === 'string' ? body.categoryId : null,
      },
      deps
    )
    if (!built.ok) return json({ error: built.message, code: built.code }, 400)
  }

  const db = getAdminFirestore()
  const userRef = db.collection(Collections.USERS).doc(targetUid)
  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef)
      if (!snap.exists) return { status: 404, body: { error: 'Kullanıcı bulunamadı' } }
      const before = snap.data() as Record<string, unknown>
      const target = await resolveTargetIdentity(targetUid, before)

      let after: { role: string; cmsScope: Record<string, unknown> | null }
      if (action === 'assign' && built?.ok) {
        const decision = canAssign(actor, target, {
          tier: body.tier as AssignableTier,
          provinceSlug: String(body.provinceSlug ?? ''),
          districtSlug: typeof body.districtSlug === 'string' ? body.districtSlug : null,
          categoryId: typeof body.categoryId === 'string' ? body.categoryId : null,
        })
        if (!decision.ok) return { status: 403, body: { error: decision.message, code: decision.code } }
        after = { role: built.role, cmsScope: built.cmsScope as Record<string, unknown> }
      } else {
        const decision = canRevoke(actor, target)
        if (!decision.ok) return { status: 403, body: { error: decision.message, code: decision.code } }
        after = { role: 'user', cmsScope: null }
      }

      tx.update(userRef, {
        role: after.role,
        cmsScope: after.cmsScope === null ? FieldValue.delete() : after.cmsScope,
        cmsScopeUpdatedAt: Date.now(),
        cmsScopeUpdatedBy: actor.uid,
      })
      tx.set(db.collection(AUDIT_COLLECTION).doc(), {
        action,
        actorUid: actor.uid,
        actorRole: actor.role,
        targetUid,
        before: { role: before.role ?? null, cmsScope: before.cmsScope ?? null },
        after,
        at: Date.now(),
      })
      return { status: 200, body: { ok: true, targetUid, ...after } }
    })
    return json(result.body, result.status)
  } catch (err) {
    console.error('[admin/staff/assignments]', err)
    return json({ error: 'İşlem başarısız' }, 500)
  }
}
