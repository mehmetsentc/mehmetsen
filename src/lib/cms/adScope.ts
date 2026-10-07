/**
 * Phase 2C — local (il/ilçe) ads for scoped editors. Pure rules.
 *
 * - Scoped editors only see/manage ads targeted inside their il (and ilçe); national
 *   (untargeted) ads stay with global staff.
 * - Ads by scoped editors are forced to their il/ilçe, may only use the local-news
 *   (`category-yerel-haber-*`) slots, never HTML (no markup injection on public pages),
 *   and start `pending`.
 * - The il genel editörü of that il (or global staff) approves/rejects; any later edit by
 *   a non-approver sends the ad back to `pending`.
 * Category scope is not applied to ads: local ads render on the il's local page.
 */
import type { CmsRole } from '@/types/cms'
import {
  canAccessDistrict,
  canAccessProvince,
  staffTierOf,
  type StaffScopeState,
} from '@/lib/cms/rbacScope'

export const LOCAL_AD_SLOT_PREFIX = 'category-yerel-haber-'

export interface AdActor {
  role: CmsRole
  scope: StaffScopeState
}

export interface AdTarget {
  provinceSlug?: string | null
  districtSlug?: string | null
}

function scopedProvince(scope: StaffScopeState): string | null {
  return scope.kind === 'scoped' && scope.scope.provinceSlugs.length === 1 ? scope.scope.provinceSlugs[0]! : null
}

/** Can this actor see / edit / delete the ad? */
export function canManageAd(actor: AdActor, ad: AdTarget): boolean {
  if (actor.scope.kind === 'unscoped') return true
  if (actor.scope.kind === 'invalid' || !ad.provinceSlug) return false
  // A province-wide ad (no districtSlug) is outside a district editor's reach.
  return canAccessProvince(actor.scope, ad.provinceSlug) && canAccessDistrict(actor.scope, ad.districtSlug ?? '')
}

/** Approver = global staff, or the il genel editörü of the ad's il. */
export function canApproveAd(actor: AdActor, ad: AdTarget): boolean {
  if (actor.scope.kind === 'unscoped') return true
  return (
    actor.role === 'managing_editor' &&
    staffTierOf(actor.scope) === 'province_general' &&
    Boolean(ad.provinceSlug) &&
    scopedProvince(actor.scope) === ad.provinceSlug
  )
}

/**
 * Targeting a scoped editor's new/edited ad gets. Returns an error string or the
 * forced target. `requestedDistrict` is honoured only for an il genel editörü.
 */
export function forcedAdTarget(
  actor: AdActor,
  requestedDistrict: string | null | undefined,
  isDistrictOfProvince: (d: string, p: string) => boolean
): { ok: true; provinceSlug: string; districtSlug: string | null } | { ok: false; error: string } {
  if (actor.scope.kind !== 'scoped') return { ok: false, error: 'Yetki kapsamı geçersiz' }
  const province = scopedProvince(actor.scope)
  if (!province) return { ok: false, error: 'Yerel reklam için tek bir il kapsamı gerekli' }
  const own = actor.scope.scope.districtSlugs
  if (own.length === 1) return { ok: true, provinceSlug: province, districtSlug: own[0]! }
  const district = String(requestedDistrict ?? '').trim()
  if (!district) return { ok: true, provinceSlug: province, districtSlug: null }
  if (!isDistrictOfProvince(district, province)) return { ok: false, error: 'İlçe bu ile ait değil' }
  return { ok: true, provinceSlug: province, districtSlug: district }
}
