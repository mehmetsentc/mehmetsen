/**
 * Who may see / manage / publish to which social account, and which rules they
 * may write. Pure — the actor is resolved once per request (actor.ts).
 *
 *   owner kind   manage (connect, pause, rules)            publish (manual)
 *   ─────────────────────────────────────────────────────────────────────────
 *   central      central social admins                     same
 *   province     central admins + that il's il yöneticisi  same
 *   publisher    publisher OWNER / ADMIN (team:manage)      + EDITOR (content:publish)
 *   user         only that user                            only that user
 *
 * - Central admins also SEE publisher accounts (read-only oversight). Nobody
 *   but the owner sees a personal (user) account.
 * - A connected personal account never grants rights over corporate accounts:
 *   rights come only from the CMS role/scope or publisher membership.
 * - Rule scope: an il yöneticisi can only target their own province(s); a
 *   publisher rule is always limited to that publisher's own news; national /
 *   "all news" rules on corporate accounts need a central admin.
 */
import { ownershipKind, type OwnershipKind, type SocialAccountOwnership } from './types'
import type { AutomationGeo } from '../automation/types'

export interface SocialActor {
  uid: string
  /** Central social admin (unscoped CMS with system:settings). */
  central: boolean
  /** Provinces this actor manages as il yöneticisi (CMS province_general scope). */
  provinces: string[]
  /** Publishers where the actor may manage social accounts (team:manage). */
  publisherManage: string[]
  /** Publishers where the actor may publish manually (content:publish). */
  publisherPublish: string[]
  /** CMS staff (any role) — editors may still use the newsroom share flows. */
  isStaff: boolean
  /** Display names of the actor's publishers (UI only, never used for decisions). */
  publisherNames?: Record<string, string>
  /** CMS role has news:publish (newsroom editor). */
  newsPublisher?: boolean
  /** CMS staff content scope; null/undefined = unscoped (global) staff. */
  staffScope?: { provinces: string[]; districts: string[]; categories: string[] } | null
}

/**
 * Manual publishing with the account's «Manuel paylaşım» setting:
 *   managers       → account managers (+ publisher editors) — canPublishToAccount
 *   scope_editors  → also newsroom editors (news:publish): unscoped editors on
 *                    corporate accounts, scoped editors only on il accounts
 *                    inside their own staff scope. Personal and publisher
 *                    accounts never open to outside editors.
 * The news item must additionally be inside the editor's content scope
 * (checked where the news is known).
 */
export function canUseForManual(actor: SocialActor, ownership: SocialAccountOwnership, manualAccess: 'managers' | 'scope_editors'): boolean {
  if (canPublishToAccount(actor, ownership)) return true
  if (manualAccess !== 'scope_editors' || !actor.newsPublisher || !actor.isStaff) return false
  const kind = ownershipKind(ownership)
  if (kind === 'central') return !actor.staffScope
  if (kind === 'province') return !actor.staffScope || (!!ownership.citySlug && actor.staffScope.provinces.includes(ownership.citySlug))
  return false
}

export function canManageAccount(actor: SocialActor, ownership: SocialAccountOwnership): boolean {
  switch (ownershipKind(ownership)) {
    case 'user':
      return !!ownership.ownerUid && ownership.ownerUid === actor.uid
    case 'publisher':
      return !!ownership.publisherId && actor.publisherManage.includes(ownership.publisherId)
    case 'central':
      return actor.central
    case 'province':
      return actor.central || (!!ownership.citySlug && actor.provinces.includes(ownership.citySlug))
    default:
      return false
  }
}

export function canPublishToAccount(actor: SocialActor, ownership: SocialAccountOwnership): boolean {
  if (canManageAccount(actor, ownership)) return true
  return ownershipKind(ownership) === 'publisher' && !!ownership.publisherId && actor.publisherPublish.includes(ownership.publisherId)
}

export function canViewAccount(actor: SocialActor, ownership: SocialAccountOwnership): boolean {
  if (canPublishToAccount(actor, ownership)) return true
  return actor.central && ownershipKind(ownership) === 'publisher'
}

export type OwnershipRequest =
  | { kind: 'user' }
  | { kind: 'publisher'; publisherId: string }
  | { kind: 'central' }
  | { kind: 'province'; citySlug: string }

/** Ownership for a NEW connection, built only from the actor's rights (never trusted from the client). */
export function ownershipFor(actor: SocialActor, req: OwnershipRequest): SocialAccountOwnership | null {
  switch (req.kind) {
    case 'user':
      return { citySlug: null, publisherId: null, ownerUid: actor.uid }
    case 'publisher':
      return actor.publisherManage.includes(req.publisherId) ? { citySlug: null, publisherId: req.publisherId } : null
    case 'central':
      return actor.central ? { citySlug: null, publisherId: null, central: true } : null
    case 'province':
      return actor.central || actor.provinces.includes(req.citySlug) ? { citySlug: req.citySlug, publisherId: null } : null
  }
}

export function parseOwnershipRequest(raw: unknown): OwnershipRequest | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  // Back-compat: the admin panel sends { citySlug } for province desks. Mixed / ambiguous input is rejected.
  if (r.kind === undefined && r.publisherId !== undefined && r.publisherId !== null) return null
  const kind = typeof r.kind === 'string' ? r.kind : typeof r.citySlug === 'string' ? 'province' : ''
  if (kind === 'user') return { kind }
  if (kind === 'central') return { kind }
  if (kind === 'publisher' && typeof r.publisherId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(r.publisherId)) {
    return { kind, publisherId: r.publisherId }
  }
  if (kind === 'province' && typeof r.citySlug === 'string' && /^[a-z0-9-]{2,40}$/.test(r.citySlug.trim())) {
    return { kind, citySlug: r.citySlug.trim() }
  }
  return null
}

export interface RuleScopeInput {
  geo: AutomationGeo
  dailyLimit: number
}

/** Max daily posts a personal account's rules may request (kept modest by default). */
export const PERSONAL_DAILY_LIMIT_MAX = 10

/**
 * Why this actor may not write this rule for this account (null = allowed).
 * Caller must already have checked canManageAccount.
 */
export function ruleScopeProblem(actor: SocialActor, ownership: SocialAccountOwnership, rule: RuleScopeInput): string | null {
  const kind: OwnershipKind | null = ownershipKind(ownership)
  if (kind === 'user') {
    return rule.dailyLimit > PERSONAL_DAILY_LIMIT_MAX ? `Kişisel hesapta günlük sınır en fazla ${PERSONAL_DAILY_LIMIT_MAX}` : null
  }
  if (kind === 'publisher') return null // always narrowed to the publisher's own news (publisherId condition)
  if (actor.central) return null
  if (kind === 'central') return 'Merkez hesabı kuralları yalnızca merkez yöneticisi tarafından yazılır'
  // Province manager on a province account: only their own province(s).
  const g = rule.geo
  if (g.kind === 'provinces') {
    const outside = g.citySlugs.find((c) => !actor.provinces.includes(c))
    return outside ? `Yetkiniz dışındaki il: ${outside}` : null
  }
  if (g.kind === 'districts') return actor.provinces.includes(g.citySlug) ? null : `Yetkiniz dışındaki il: ${g.citySlug}`
  return 'İl yöneticisi yalnızca kendi ilini (veya ilçelerini) seçebilir'
}
