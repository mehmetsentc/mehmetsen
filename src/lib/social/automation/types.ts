/**
 * Account-bound social automation rules — types + validation (pure).
 *
 * A rule is ALWAYS bound to one connected account record (`socialAccounts/{id}`).
 * It never targets "a platform" or the legacy Onyeditivi credentials.
 *
 *   socialAutomationRules/{ruleId}      → AutomationRule (this file)
 *   smmQueue/auto__{news}__{acct}__{fmt} → automation job (jobs.ts)
 *   socialAutomationCounters/{accountId} → daily count + last send (limits.ts)
 *   socialAutomationState/{doc}          → reconcile cursors, legacy handoffs
 *
 * Match = GEO  AND  CONTENT, where CONTENT is one of:
 *   categories_only         → category ∈ seçilen kategoriler
 *   featured_only           → öne çıkan
 *   categories_or_featured  → category ∈ seçilen  VEYA  öne çıkan
 *   featured_in_categories  → category ∈ seçilen  VE    öne çıkan
 *
 * Geo kinds, defined ONLY by real news fields (no guessing):
 *   national      = has a category outside the yerel / Kıbrıs / Dünya trees and
 *                   is not marked abroad. This is "ulusal kategori", NOT a
 *                   verified «Türkiye haberi»: the news model has no reliable
 *                   country field for national news (CMS writes country only
 *                   with a domestic il; the AI pipeline falls back to
 *                   'Türkiye'), so the category is what defines it.
 *   world         = category «Dünya» (categoryId / originalCategoryId 'dunya')
 *                   or abroad geo (countrySlug, or a non-Türkiye country,
 *                   without a domestic il).
 *   all_provinces = any news WITH a province (citySlug).
 *   any           = every news item, INCLUDING ones whose location is unknown.
 * A news item without location data is never treated as national, world or
 * belonging to a province.
 */
import { DISTRICT_TO_PROVINCE_SLUG, TURKISH_PROVINCES } from '@/constants/cities'
import { PROVINCE_DISTRICTS } from '@/constants/turkishDistricts'
import type { AutomationFormat } from '../accounts/capabilities'
import type { SocialAccountOwnership, SocialAccountPlatform } from '../accounts/types'

export type AutomationGeo =
  | { kind: 'national' }
  | { kind: 'world' }
  | { kind: 'all_provinces' }
  | { kind: 'provinces'; citySlugs: string[] }
  | { kind: 'districts'; citySlug: string; districtSlugs: string[] }
  | { kind: 'any' }

/** What each location option is based on — shown under the selector (real fields only). */
export const GEO_KIND_BASIS: Partial<Record<AutomationGeo['kind'], string>> = {
  national: 'Ulusal = haberin kategorisi yerel, Kıbrıs veya Dünya ağacında değil ve yurt dışı konumu yok. Haberde güvenilir bir «Türkiye» alanı olmadığından bu bir konum doğrulaması değil, kategori sınıflandırmasıdır. İli ve kategorisi olmayan haber ulusal sayılmaz.',
  world: 'Dünya = kategori «Dünya» ya da haberde yurt dışı konum (ülke) var ve yurt içi il yok.',
  all_provinces: 'Yalnız il bilgisi olan haberler. Konumu belirsiz haber il hedefine gönderilmez.',
  any: 'Konumu belirsiz (ili ve ulusal/dünya kategorisi olmayan) haberler de dahildir. Bu seçenek il hedefi değildir.',
}

export const FEATURED_MODES = ['categories_only', 'featured_only', 'categories_or_featured', 'featured_in_categories'] as const
export type FeaturedMode = (typeof FEATURED_MODES)[number]

/** Which "öne çıkan" pin counts: nahaber.com manşet, il sayfası manşeti, ya da ikisinden biri. */
export const FEATURED_KINDS = ['national', 'local', 'either'] as const
export type FeaturedKind = (typeof FEATURED_KINDS)[number]

export interface QuietHours {
  /** Europe/Istanbul local hour 0–23, inclusive start. */
  startHour: number
  /** Exclusive end hour 0–23. start > end wraps midnight (e.g. 23 → 7). */
  endHour: number
}

export interface AutomationRuleInput {
  name: string
  accountId: string
  geo: AutomationGeo
  /** Explicit category ids. `allCategories` must be set explicitly to mean "every category". */
  categoryIds: string[]
  allCategories: boolean
  featuredMode: FeaturedMode
  featuredKind: FeaturedKind
  formats: AutomationFormat[]
  dailyLimit: number
  minIntervalMinutes: number
  quietHours: QuietHours | null
}

export interface AutomationRule extends AutomationRuleInput {
  id: string
  platform: SocialAccountPlatform
  /** Copied from the account at create time — never from the client. */
  ownership: SocialAccountOwnership
  /**
   * Publisher accounts: rules only ever match that publisher's own news.
   * Set by the server from the account; null for every other owner kind.
   */
  publisherId?: string | null
  enabled: boolean
  /** Only news published at/after this moment can match (no backfill). null while disabled. */
  enabledAt: number | null
  createdAt: number
  createdBy: string
  updatedAt: number
  updatedBy: string
}

export const RULE_LIMITS = {
  nameMax: 80,
  categoriesMax: 40,
  provincesMax: 81,
  districtsMax: 60,
  dailyLimitMin: 1,
  dailyLimitMax: 50,
  dailyLimitDefault: 10,
  minIntervalMin: 5,
  minIntervalMax: 24 * 60,
  minIntervalDefault: 30,
} as const

const PROVINCE_SLUGS = new Set(TURKISH_PROVINCES.map((p) => p.slug))
const CATEGORY_RE = /^[a-z0-9][a-z0-9-]{0,63}$/
const ACCOUNT_ID_RE = /^(facebook|instagram|threads)_[0-9]{1,30}$/

export function isProvinceSlug(slug: string): boolean {
  return PROVINCE_SLUGS.has(slug)
}

export function isDistrictOf(citySlug: string, districtSlug: string): boolean {
  return (PROVINCE_DISTRICTS[citySlug] ?? []).some((d) => d.slug === districtSlug)
}

/** News citySlug → province slug (old records may carry a district slug as citySlug). */
export function provinceOf(citySlug: string): string {
  const s = citySlug.trim().toLowerCase()
  if (!s) return ''
  if (PROVINCE_SLUGS.has(s)) return s
  return DISTRICT_TO_PROVINCE_SLUG[s] ?? s
}

export type RuleValidation = { ok: true; value: AutomationRuleInput } | { ok: false; field: string; message: string }

function bad(field: string, message: string): RuleValidation {
  return { ok: false, field, message }
}

function uniqStrings(v: unknown, max: number): string[] | null {
  if (!Array.isArray(v)) return null
  const out: string[] = []
  for (const x of v) {
    if (typeof x !== 'string') return null
    const s = x.trim().toLowerCase()
    if (s && !out.includes(s)) out.push(s)
  }
  return out.length > max ? null : out
}

function intIn(v: unknown, min: number, max: number, fallback: number): number | null {
  if (v === undefined || v === null || v === '') return fallback
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isInteger(n) || n < min || n > max) return null
  return n
}

export function parseGeo(raw: unknown): AutomationGeo | string {
  if (!raw || typeof raw !== 'object') return 'Konum koşulu seçilmeli'
  const g = raw as Record<string, unknown>
  switch (g.kind) {
    case 'national':
      return { kind: 'national' }
    case 'world':
      return { kind: 'world' }
    case 'any':
      return { kind: 'any' }
    case 'all_provinces':
      return { kind: 'all_provinces' }
    case 'provinces': {
      const slugs = uniqStrings(g.citySlugs, RULE_LIMITS.provincesMax)
      if (!slugs || slugs.length === 0) return 'En az bir il seçilmeli'
      const unknown = slugs.find((s) => !isProvinceSlug(s))
      if (unknown) return `Bilinmeyen il: ${unknown.slice(0, 40)}`
      return { kind: 'provinces', citySlugs: slugs }
    }
    case 'districts': {
      const city = typeof g.citySlug === 'string' ? g.citySlug.trim().toLowerCase() : ''
      if (!isProvinceSlug(city)) return 'İlçe koşulu için geçerli bir il seçilmeli'
      const ds = uniqStrings(g.districtSlugs, RULE_LIMITS.districtsMax)
      if (!ds || ds.length === 0) return 'En az bir ilçe seçilmeli'
      const unknown = ds.find((d) => !isDistrictOf(city, d))
      if (unknown) return `Bu ile ait olmayan ilçe: ${unknown.slice(0, 40)}`
      return { kind: 'districts', citySlug: city, districtSlugs: ds }
    }
    default:
      return 'Geçersiz konum koşulu'
  }
}

/** Validate client input. Never trusts ownership / platform / enabled from the client. */
export function validateRuleInput(raw: unknown): RuleValidation {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('body', 'Geçersiz istek')
  const r = raw as Record<string, unknown>

  const name = typeof r.name === 'string' ? r.name.trim().replace(/\s+/g, ' ') : ''
  if (!name || name.length > RULE_LIMITS.nameMax) return bad('name', `Kural adı 1–${RULE_LIMITS.nameMax} karakter olmalı`)

  const accountId = typeof r.accountId === 'string' ? r.accountId.trim() : ''
  if (!ACCOUNT_ID_RE.test(accountId)) return bad('accountId', 'Geçerli bir hedef hesap seçilmeli')

  const geo = parseGeo(r.geo)
  if (typeof geo === 'string') return bad('geo', geo)

  const allCategories = r.allCategories === true
  const categoryIds = uniqStrings(r.categoryIds ?? [], RULE_LIMITS.categoriesMax)
  if (!categoryIds) return bad('categoryIds', `En fazla ${RULE_LIMITS.categoriesMax} kategori seçilebilir`)
  if (categoryIds.some((c) => !CATEGORY_RE.test(c))) return bad('categoryIds', 'Geçersiz kategori')

  const featuredMode = r.featuredMode as FeaturedMode
  if (!(FEATURED_MODES as readonly string[]).includes(featuredMode)) return bad('featuredMode', 'İçerik koşulu seçilmeli')
  const featuredKind = (r.featuredKind ?? 'either') as FeaturedKind
  if (!(FEATURED_KINDS as readonly string[]).includes(featuredKind)) return bad('featuredKind', 'Geçersiz öne çıkan türü')

  const needsCategories = featuredMode !== 'featured_only'
  if (needsCategories && !allCategories && categoryIds.length === 0) {
    return bad('categoryIds', 'En az bir kategori seçin ya da «Tüm kategoriler»i açıkça işaretleyin')
  }
  if (!needsCategories && (allCategories || categoryIds.length > 0)) {
    return bad('categoryIds', '«Yalnızca öne çıkanlar» koşulunda kategori seçilmez')
  }
  if (allCategories && categoryIds.length > 0) return bad('categoryIds', '«Tüm kategoriler» ile tek tek kategori birlikte seçilemez')
  if (featuredMode === 'categories_or_featured' && allCategories) {
    return bad('featuredMode', '«Tüm kategoriler VEYA öne çıkan» zaten tüm haberler demektir — «Yalnızca kategoriler» + «Tüm kategoriler» seçin')
  }

  const formats = uniqStrings(r.formats, 3) as AutomationFormat[] | null
  if (!formats || formats.length === 0 || formats.some((f) => f !== 'post' && f !== 'story' && f !== 'reel')) {
    return bad('formats', 'En az bir biçim seçilmeli (gönderi / hikâye / reels)')
  }
  // Otomatik hikâye yalnız açık bir öne çıkan / önem koşuluyla: «tüm konumlar»
  // veya bir kategori tek başına her haberi hikâyeye göndermez.
  if (formats.includes('story') && featuredMode !== 'featured_only' && featuredMode !== 'featured_in_categories') {
    return bad('formats', 'Otomatik hikâye için öne çıkan koşulu gerekir: «Yalnızca öne çıkanlar» veya «Seçilen kategorilerde yalnızca öne çıkanlar»')
  }

  const dailyLimit = intIn(r.dailyLimit, RULE_LIMITS.dailyLimitMin, RULE_LIMITS.dailyLimitMax, RULE_LIMITS.dailyLimitDefault)
  if (dailyLimit === null) return bad('dailyLimit', `Günlük sınır ${RULE_LIMITS.dailyLimitMin}–${RULE_LIMITS.dailyLimitMax} olmalı`)
  const minIntervalMinutes = intIn(r.minIntervalMinutes, RULE_LIMITS.minIntervalMin, RULE_LIMITS.minIntervalMax, RULE_LIMITS.minIntervalDefault)
  if (minIntervalMinutes === null) return bad('minIntervalMinutes', `Paylaşım aralığı ${RULE_LIMITS.minIntervalMin}–${RULE_LIMITS.minIntervalMax} dakika olmalı`)

  let quietHours: QuietHours | null = null
  if (r.quietHours !== undefined && r.quietHours !== null) {
    const q = r.quietHours as Record<string, unknown>
    const startHour = intIn(q?.startHour, 0, 23, -1)
    const endHour = intIn(q?.endHour, 0, 23, -1)
    if (startHour === null || endHour === null || startHour < 0 || endHour < 0 || startHour === endHour) {
      return bad('quietHours', 'Sessiz saatler 0–23 arası, başlangıç ≠ bitiş olmalı')
    }
    quietHours = { startHour, endHour }
  }

  return {
    ok: true,
    value: { name, accountId, geo, categoryIds: allCategories ? [] : categoryIds, allCategories, featuredMode, featuredKind, formats, dailyLimit, minIntervalMinutes, quietHours },
  }
}

/** Platform of an account id (`facebook_123` → facebook). */
export function platformOfAccountId(accountId: string): SocialAccountPlatform | null {
  const m = /^(facebook|instagram|threads)_/.exec(accountId)
  return m ? (m[1] as SocialAccountPlatform) : null
}
