/**
 * Phase 2 — 81-il staff hierarchy (pure rules, no I/O).
 *
 *   super_admin
 *     └─ il genel editörü          province_general   role managing_editor  { provinceSlugs:[p] }
 *          ├─ ilçe genel editörü  district_general   role editor           { provinceSlugs:[p], districtSlugs:[d] }
 *          │    └─ ilçe kategori  district_category  role editor           { …, districtSlugs:[d], categoryIds:[c] }
 *
 * Assignment authority (decided 2026-10-07):
 *   - super_admin assigns/revokes every tier;
 *   - il genel editörü assigns/revokes district tiers inside its own province only;
 *   - nobody else assigns. Nobody changes their own scope through this path.
 * Rollout: only provinces in STAFF_HIERARCHY_ACTIVE_PROVINCES accept new assignments
 * (Çanakkale first; other provinces are opened one by one with a code change).
 */
import type { CmsRole } from '@/types/cms'
import type { StaffContentScope, StaffScopeState, StaffSection, StaffTier } from '@/lib/cms/rbacScope'
import { staffTierOf } from '@/lib/cms/rbacScope'
import { STAFF_RIGHTS, isStaffRight } from '@/lib/cms/staffRights'

export const STAFF_HIERARCHY_ACTIVE_PROVINCES: readonly string[] = ['canakkale']

export function isStaffHierarchyActiveProvince(provinceSlug: string): boolean {
  return STAFF_HIERARCHY_ACTIVE_PROVINCES.includes(provinceSlug)
}

export type AssignableTier = 'province_general' | 'district_general' | 'district_category'

export const ASSIGNABLE_TIERS: readonly AssignableTier[] = [
  'province_general',
  'district_general',
  'district_category',
]

export const TIER_ROLE: Readonly<Record<AssignableTier, CmsRole>> = {
  province_general: 'managing_editor',
  district_general: 'editor',
  district_category: 'editor',
}

export interface AssignmentRequest {
  tier: AssignableTier
  provinceSlug: string
  districtSlug?: string | null
  categoryId?: string | null
}

export interface HierarchyDeps {
  isProvinceSlug: (slug: string) => boolean
  isDistrictOfProvince: (districtSlug: string, provinceSlug: string) => boolean
  isKnownCategory: (categoryId: string) => boolean
}

/** Actor or target identity as resolved server-side (exact Firebase UID). */
export interface StaffIdentity {
  uid: string
  role: CmsRole
  scope: StaffScopeState
}

export type HierarchyDecision = { ok: true } | { ok: false; code: string; message: string }

type Denied = { ok: false; code: string; message: string }
const deny = (code: string, message: string): Denied => ({ ok: false, code, message })

/** Validate the request shape and build the exact cmsScope + role to persist. */
export function buildAssignment(
  req: AssignmentRequest,
  deps: HierarchyDeps
): { ok: true; role: CmsRole; cmsScope: Partial<StaffContentScope> } | Denied {
  const province = String(req.provinceSlug ?? '').trim()
  const district = String(req.districtSlug ?? '').trim()
  const category = String(req.categoryId ?? '').trim()
  if (!ASSIGNABLE_TIERS.includes(req.tier)) return deny('INVALID_TIER', 'Geçersiz editör seviyesi')
  if (!deps.isProvinceSlug(province)) return deny('INVALID_PROVINCE', 'Geçersiz il')
  if (!isStaffHierarchyActiveProvince(province)) {
    return deny('PROVINCE_NOT_ACTIVE', 'Bu il için editör yapısı henüz açılmadı')
  }
  if (req.tier === 'province_general') {
    if (district || category) return deny('INVALID_SHAPE', 'İl genel editörü ilçe/kategori almaz')
    return { ok: true, role: TIER_ROLE.province_general, cmsScope: { provinceSlugs: [province] } }
  }
  if (!district || !deps.isDistrictOfProvince(district, province)) {
    return deny('INVALID_DISTRICT', 'İlçe bu ile ait değil')
  }
  if (req.tier === 'district_general') {
    if (category) return deny('INVALID_SHAPE', 'İlçe genel editörü kategori almaz')
    return {
      ok: true,
      role: TIER_ROLE.district_general,
      cmsScope: { provinceSlugs: [province], districtSlugs: [district] },
    }
  }
  if (!category || !deps.isKnownCategory(category)) return deny('INVALID_CATEGORY', 'Geçersiz kategori')
  return {
    ok: true,
    role: TIER_ROLE.district_category,
    cmsScope: { provinceSlugs: [province], districtSlugs: [district], categoryIds: [category] },
  }
}

function provinceOf(state: StaffScopeState): string | null {
  return state.kind === 'scoped' && state.scope.provinceSlugs.length === 1
    ? state.scope.provinceSlugs[0]!
    : null
}

function isProvinceGeneralOf(actor: StaffIdentity, province: string): boolean {
  return (
    actor.role === 'managing_editor' &&
    staffTierOf(actor.scope) === 'province_general' &&
    provinceOf(actor.scope) === province
  )
}

const SUBORDINATE_TIERS: readonly StaffTier[] = ['district_general', 'district_category', 'section_editor']

/** Target may be touched only if it is a plain user or a subordinate editor of `province`. */
function targetIsManageableByProvinceEditor(target: StaffIdentity, province: string): boolean {
  if (target.role === 'user' && target.scope.kind === 'unscoped') return true
  return SUBORDINATE_TIERS.includes(staffTierOf(target.scope)) && provinceOf(target.scope) === province
}

export interface SectionInput {
  districtSlug?: string | null
  categoryId?: string | null
  rights?: unknown
}

export const MAX_STAFF_SECTIONS = 50

/**
 * Phase 2D: validate a section editor's areas (all in ONE province) + per-area rights.
 * Rights start empty and are granted one by one. Returns the exact cmsScope to store.
 */
export function buildSections(
  provinceSlug: string,
  input: SectionInput[],
  deps: HierarchyDeps
): { ok: true; role: CmsRole; cmsScope: { provinceSlugs: string[]; sections: StaffSection[] } } | Denied {
  const province = String(provinceSlug ?? '').trim()
  if (!deps.isProvinceSlug(province)) return deny('INVALID_PROVINCE', 'Geçersiz il')
  if (!isStaffHierarchyActiveProvince(province)) return deny('PROVINCE_NOT_ACTIVE', 'Bu il için editör yapısı henüz açılmadı')
  if (!Array.isArray(input) || input.length === 0) return deny('NO_SECTIONS', 'En az bir bölüm seçin')
  if (input.length > MAX_STAFF_SECTIONS) return deny('TOO_MANY_SECTIONS', 'Çok fazla bölüm')
  const sections: StaffSection[] = []
  for (const raw of input) {
    const d = String(raw?.districtSlug ?? '').trim() || null
    const c = String(raw?.categoryId ?? '').trim() || null
    if (d && !deps.isDistrictOfProvince(d, province)) return deny('INVALID_DISTRICT', 'İlçe bu ile ait değil')
    if (c && !deps.isKnownCategory(c)) return deny('INVALID_CATEGORY', 'Geçersiz kategori')
    if (!d && !c) return deny('SECTION_TOO_BROAD', 'Bölüm için ilçe veya kategori seçin (tüm il = il genel editörü)')
    if (!Array.isArray(raw?.rights) || !(raw.rights as unknown[]).every(isStaffRight)) {
      return deny('INVALID_RIGHTS', 'Geçersiz yetki')
    }
    if (sections.some((s) => s.districtSlug === d && s.categoryId === c)) {
      return deny('DUPLICATE_SECTION', 'Aynı bölüm iki kez seçildi')
    }
    sections.push({ districtSlug: d, categoryId: c, rights: STAFF_RIGHTS.filter((r) => (raw.rights as unknown[]).includes(r)) })
  }
  return { ok: true, role: 'editor', cmsScope: { provinceSlugs: [province], sections } }
}

/** May `actor` set `target`'s sections in `province`? */
export function canSetSections(actor: StaffIdentity, target: StaffIdentity, province: string): HierarchyDecision {
  if (actor.uid === target.uid) return deny('SELF_ASSIGNMENT', 'Kendi yetkinizi değiştiremezsiniz')
  if (target.role === 'super_admin') return deny('TARGET_SUPER_ADMIN', 'Süper admin değiştirilemez')
  if (actor.role === 'super_admin') return { ok: true }
  if (!isProvinceGeneralOf(actor, province)) return deny('NOT_ALLOWED', 'Bu atamayı yapma yetkiniz yok')
  if (!targetIsManageableByProvinceEditor(target, province)) {
    return deny('TARGET_OUT_OF_REACH', 'Bu kullanıcı sizin ilinizdeki bir editör veya normal kullanıcı değil')
  }
  return { ok: true }
}

/** May `actor` give `target` the tier in `req`? (shape already validated by buildAssignment) */
export function canAssign(actor: StaffIdentity, target: StaffIdentity, req: AssignmentRequest): HierarchyDecision {
  if (actor.uid === target.uid) return deny('SELF_ASSIGNMENT', 'Kendi yetkinizi değiştiremezsiniz')
  if (target.role === 'super_admin') return deny('TARGET_SUPER_ADMIN', 'Süper admin değiştirilemez')
  if (actor.role === 'super_admin') return { ok: true }
  if (!isProvinceGeneralOf(actor, req.provinceSlug)) {
    return deny('NOT_ALLOWED', 'Bu atamayı yapma yetkiniz yok')
  }
  if (req.tier === 'province_general') return deny('NOT_ALLOWED', 'İl genel editörünü yalnızca süper admin atar')
  if (!targetIsManageableByProvinceEditor(target, req.provinceSlug)) {
    return deny('TARGET_OUT_OF_REACH', 'Bu kullanıcı sizin ilinizdeki bir ilçe editörü veya normal kullanıcı değil')
  }
  return { ok: true }
}

/** May `actor` revoke `target`'s hierarchy role (→ plain user, no scope)? */
export function canRevoke(actor: StaffIdentity, target: StaffIdentity): HierarchyDecision {
  if (actor.uid === target.uid) return deny('SELF_ASSIGNMENT', 'Kendi yetkinizi değiştiremezsiniz')
  if (target.role === 'super_admin') return deny('TARGET_SUPER_ADMIN', 'Süper admin değiştirilemez')
  const tier: StaffTier = staffTierOf(target.scope)
  if (tier === 'unscoped') return deny('NOT_SCOPED', 'Kullanıcı kapsamlı editör değil')
  if (actor.role === 'super_admin') return { ok: true }
  const province = provinceOf(target.scope)
  if (!province || !isProvinceGeneralOf(actor, province)) return deny('NOT_ALLOWED', 'Bu işlemi yapma yetkiniz yok')
  if (!SUBORDINATE_TIERS.includes(tier)) {
    return deny('NOT_ALLOWED', 'Yalnızca ilçe/bölüm editörlerini kaldırabilirsiniz')
  }
  return { ok: true }
}

/** Who may list/manage the staff of `province`. */
export function canManageProvinceStaff(actor: StaffIdentity, province: string): boolean {
  return actor.role === 'super_admin' || isProvinceGeneralOf(actor, province)
}
