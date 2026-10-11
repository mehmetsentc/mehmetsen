/**
 * NaHaber-side publish scope of a connected account («Yayın kapsamı ve
 * izinler») — pure. This is NaHaber's own rule set and is separate from the
 * API permissions the platform granted (those are on the account record).
 *
 *   socialAccounts/{id}.publishScope = {
 *     geo            where the account may publish MANUALLY (il / ilçe / ulusal / tüm iller / tümü)
 *     allCategories / categoryIds    which content
 *     formats        allowed formats (∩ what the account really supports)
 *     manualAccess   who may share manually:
 *                      managers       → account managers (+ publisher editors)
 *                      scope_editors  → also CMS editors with news:publish whose
 *                                       staff scope covers this account's il
 *   }
 *
 * Automation triggers are NOT here: they live in account-bound automation
 * rules (own geo/categories/featured/limits/quiet hours, own on/off switch).
 * A news item without location data never matches an il / ulusal / tüm iller
 * scope — the editor must classify it first.
 */
import { categoryMatch, geoMatch, type NewsFacts } from '../automation/match'
import { parseGeo, type AutomationGeo } from '../automation/types'
import { RULE_LIMITS } from '../automation/types'
import type { PublishFormat } from './capabilities'

export const MANUAL_ACCESS = ['managers', 'scope_editors'] as const
export type ManualAccess = (typeof MANUAL_ACCESS)[number]

export interface AccountPublishScope {
  geo: AutomationGeo
  allCategories: boolean
  categoryIds: string[]
  formats: PublishFormat[]
  manualAccess: ManualAccess
  updatedAt: number | null
  updatedBy: string | null
}

type ScopeAccount = {
  ownership: { citySlug: string | null; publisherId: string | null; ownerUid?: string | null; central?: boolean }
  publishScope?: unknown
}

/** Default when nothing was saved: il hesabı → kendi ili; diğerleri → tüm haberler. Formats = what the account supports. */
export function defaultPublishScope(a: ScopeAccount, supported: PublishFormat[]): AccountPublishScope {
  const geo: AutomationGeo = a.ownership.citySlug && !a.ownership.publisherId && !a.ownership.ownerUid && !a.ownership.central
    ? { kind: 'provinces', citySlugs: [a.ownership.citySlug] }
    : { kind: 'any' }
  return { geo, allCategories: true, categoryIds: [], formats: [...supported], manualAccess: 'managers', updatedAt: null, updatedBy: null }
}

export function readPublishScope(a: ScopeAccount, supported: PublishFormat[]): AccountPublishScope {
  const parsed = parsePublishScope(a.publishScope, supported)
  return parsed.ok ? { ...parsed.value, updatedAt: num((a.publishScope as Record<string, unknown>)?.updatedAt), updatedBy: str((a.publishScope as Record<string, unknown>)?.updatedBy) } : defaultPublishScope(a, supported)
}

const num = (v: unknown) => (typeof v === 'number' ? v : null)
const str = (v: unknown) => (typeof v === 'string' ? v : null)

export function parsePublishScope(
  raw: unknown,
  supported: PublishFormat[],
): { ok: true; value: Omit<AccountPublishScope, 'updatedAt' | 'updatedBy'> & { updatedAt: null; updatedBy: null } } | { ok: false; field: string; message: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, field: 'scope', message: 'Kapsam eksik' }
  const r = raw as Record<string, unknown>
  const geo = parseGeo(r.geo)
  if (typeof geo === 'string') return { ok: false, field: 'geo', message: geo }
  const allCategories = r.allCategories === true
  const categoryIds = Array.isArray(r.categoryIds)
    ? [...new Set(r.categoryIds.filter((c): c is string => typeof c === 'string' && /^[a-z0-9-]{1,60}$/.test(c)))].slice(0, RULE_LIMITS.categoriesMax)
    : []
  if (!allCategories && categoryIds.length === 0) return { ok: false, field: 'categoryIds', message: 'En az bir kategori seçin veya «Tüm kategoriler»' }
  const formats = Array.isArray(r.formats) ? [...new Set(r.formats.filter((f): f is PublishFormat => f === 'post' || f === 'story'))] : []
  if (formats.length === 0) return { ok: false, field: 'formats', message: 'En az bir biçim seçin' }
  const unsupported = formats.find((f) => !supported.includes(f))
  if (unsupported) return { ok: false, field: 'formats', message: `Bu hesap «${unsupported === 'post' ? 'gönderi' : 'hikâye'}» biçimini desteklemiyor` }
  const manualAccess = (MANUAL_ACCESS as readonly string[]).includes(r.manualAccess as string) ? (r.manualAccess as ManualAccess) : 'managers'
  return { ok: true, value: { geo, allCategories, categoryIds: allCategories ? [] : categoryIds, formats, manualAccess, updatedAt: null, updatedBy: null } }
}

/** Why this news item is outside the account's manual publish scope (null = inside). */
export function newsScopeProblem(scope: AccountPublishScope, n: NewsFacts): string | null {
  const g = geoMatch({ geo: scope.geo }, n)
  if (!g.ok) return g.reason
  const c = categoryMatch({ allCategories: scope.allCategories, categoryIds: scope.categoryIds }, n)
  return c.ok ? null : c.reason
}
