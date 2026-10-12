/**
 * NaHaber-side publish scope of a connected account («Yayın kapsamı ve
 * izinler») — pure. This is NaHaber's own rule set and is separate from the
 * API permissions the platform granted (those are on the account record).
 *
 *   socialAccounts/{id}.publishScope = {
 *     geo            where the account may publish MANUAL POSTS (il / ilçe / ulusal / tüm iller / tümü)
 *     storyGeo       where it may publish MANUAL STORIES. Görev 18 decision:
 *                    il / merkez accounts → «tüm konumlar» by default (posts stay
 *                    local); personal / publisher accounts → same as `geo`.
 *                    Stored only when edited, so existing accounts get the new
 *                    story default without touching their post scope or rules.
 *     allCategories / categoryIds    which content for MANUAL POSTS (exact ids;
 *                    a parent does not silently include its subcategories)
 *     storyAllCategories / storyCategoryIds   which content for MANUAL STORIES —
 *                    separate, so a «Magazin» post scope does not narrow stories.
 *                    Default: il / merkez → all; personal / publisher → post's.
 *
 *   «İçerik kapsamı» shown in the UI is derived: Genel (tüm konumlar + tüm
 *   kategoriler) · Konum · Kategori · Konum + kategori (VE). Ownership
 *   (Merkez / İl ekibi / Kişisel) is a separate field on the account.
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
  storyGeo: AutomationGeo
  allCategories: boolean
  categoryIds: string[]
  storyAllCategories: boolean
  storyCategoryIds: string[]
  formats: PublishFormat[]
  manualAccess: ManualAccess
  updatedAt: number | null
  updatedBy: string | null
}

type ScopeAccount = {
  ownership: { citySlug: string | null; publisherId: string | null; ownerUid?: string | null; central?: boolean }
  publishScope?: unknown
}

const isProvinceAccount = (a: ScopeAccount) => !!a.ownership.citySlug && !a.ownership.publisherId && !a.ownership.ownerUid && !a.ownership.central
const isCorporateAccount = (a: ScopeAccount) => isProvinceAccount(a) || (!!a.ownership.central && !a.ownership.publisherId && !a.ownership.ownerUid)

/** Story default: corporate (il / merkez) → all locations; personal / publisher → the post scope. */
export function defaultStoryGeo(a: ScopeAccount, postGeo: AutomationGeo): AutomationGeo {
  return isCorporateAccount(a) ? { kind: 'any' } : postGeo
}

/** Default when nothing was saved: il hesabı → kendi ili; diğerleri → tüm haberler. Formats = what the account supports. */
export function defaultPublishScope(a: ScopeAccount, supported: PublishFormat[]): AccountPublishScope {
  const geo: AutomationGeo = isProvinceAccount(a) ? { kind: 'provinces', citySlugs: [a.ownership.citySlug as string] } : { kind: 'any' }
  return { geo, storyGeo: defaultStoryGeo(a, geo), allCategories: true, categoryIds: [], storyAllCategories: true, storyCategoryIds: [], formats: [...supported], manualAccess: 'managers', updatedAt: null, updatedBy: null }
}

export function readPublishScope(a: ScopeAccount, supported: PublishFormat[]): AccountPublishScope {
  const parsed = parsePublishScope(a.publishScope, supported)
  if (!parsed.ok) return defaultPublishScope(a, supported)
  const raw = a.publishScope as Record<string, unknown>
  const storyGeo = raw.storyGeo === undefined ? defaultStoryGeo(a, parsed.value.geo) : parsed.value.storyGeo
  const storyCats = raw.storyAllCategories === undefined && raw.storyCategoryIds === undefined
    ? isCorporateAccount(a)
      ? { storyAllCategories: true, storyCategoryIds: [] as string[] }
      : { storyAllCategories: parsed.value.allCategories, storyCategoryIds: parsed.value.categoryIds }
    : { storyAllCategories: parsed.value.storyAllCategories, storyCategoryIds: parsed.value.storyCategoryIds }
  return { ...parsed.value, storyGeo, ...storyCats, updatedAt: num(raw?.updatedAt), updatedBy: str(raw?.updatedBy) }
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
  // storyGeo is optional (absent = account-type default, resolved by readPublishScope).
  const storyGeo = r.storyGeo === undefined ? geo : parseGeo(r.storyGeo)
  if (typeof storyGeo === 'string') return { ok: false, field: 'storyGeo', message: `Hikâye konumu: ${storyGeo}` }
  const allCategories = r.allCategories === true
  const categoryIds = Array.isArray(r.categoryIds)
    ? [...new Set(r.categoryIds.filter((c): c is string => typeof c === 'string' && /^[a-z0-9-]{1,60}$/.test(c)))].slice(0, RULE_LIMITS.categoriesMax)
    : []
  if (!allCategories && categoryIds.length === 0) return { ok: false, field: 'categoryIds', message: 'En az bir kategori seçin veya «Tüm kategoriler»' }
  // Story categories are optional in the payload (absent = account-type default via readPublishScope).
  const storyGiven = r.storyAllCategories !== undefined || r.storyCategoryIds !== undefined
  const storyAllCategories = storyGiven ? r.storyAllCategories === true : allCategories
  const storyCategoryIds = storyGiven && Array.isArray(r.storyCategoryIds)
    ? [...new Set(r.storyCategoryIds.filter((c): c is string => typeof c === 'string' && /^[a-z0-9-]{1,60}$/.test(c)))].slice(0, RULE_LIMITS.categoriesMax)
    : storyGiven ? [] : categoryIds
  if (!storyAllCategories && storyCategoryIds.length === 0) return { ok: false, field: 'storyCategoryIds', message: 'Hikâye için en az bir kategori seçin veya «Tüm kategoriler»' }
  const formats = Array.isArray(r.formats) ? [...new Set(r.formats.filter((f): f is PublishFormat => f === 'post' || f === 'story'))] : []
  if (formats.length === 0) return { ok: false, field: 'formats', message: 'En az bir biçim seçin' }
  const unsupported = formats.find((f) => !supported.includes(f))
  if (unsupported) return { ok: false, field: 'formats', message: `Bu hesap «${unsupported === 'post' ? 'gönderi' : 'hikâye'}» biçimini desteklemiyor` }
  const manualAccess = (MANUAL_ACCESS as readonly string[]).includes(r.manualAccess as string) ? (r.manualAccess as ManualAccess) : 'managers'
  return { ok: true, value: { geo, storyGeo, allCategories, categoryIds: allCategories ? [] : categoryIds, storyAllCategories, storyCategoryIds: storyAllCategories ? [] : storyCategoryIds, formats, manualAccess, updatedAt: null, updatedBy: null } }
}

export type ScopeProblem = { code: 'outside_location' | 'outside_category'; reason: string }

/**
 * Why this news item is outside the account's MANUAL scope for `format`
 * (null = inside). Posts use `geo` + post categories, stories `storyGeo` +
 * story categories (VE between location and category; VEYA among categories). Automation rules are never consulted here.
 */
export function newsScopeProblemFor(scope: AccountPublishScope, n: NewsFacts, format: PublishFormat): ScopeProblem | null {
  const g = geoMatch({ geo: format === 'story' ? scope.storyGeo : scope.geo }, n)
  if (!g.ok) return { code: 'outside_location', reason: g.reason }
  const c = format === 'story'
    ? categoryMatch({ allCategories: scope.storyAllCategories, categoryIds: scope.storyCategoryIds }, n)
    : categoryMatch({ allCategories: scope.allCategories, categoryIds: scope.categoryIds }, n)
  return c.ok ? null : { code: 'outside_category', reason: c.reason }
}

/** Post-scope check (kept for callers that have no format). */
export function newsScopeProblem(scope: AccountPublishScope, n: NewsFacts): string | null {
  return newsScopeProblemFor(scope, n, 'post')?.reason ?? null
}

/** «İçerik kapsamı» label derived from location + categories (ownership is separate). */
export function contentScopeLabel(geo: AutomationGeo, allCategories: boolean): 'Genel' | 'Konum' | 'Kategori' | 'Konum + kategori' {
  const anyLocation = geo.kind === 'any'
  if (anyLocation && allCategories) return 'Genel'
  if (anyLocation) return 'Kategori'
  if (allCategories) return 'Konum'
  return 'Konum + kategori'
}
