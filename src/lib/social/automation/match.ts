/**
 * Pure rule evaluation: (rule, news facts) → match + Turkish reasons.
 * No Firestore, no clock — the caller passes everything in, so preview,
 * reconcile and the pre-send recheck all use exactly this function.
 */
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { getCityCategoryName, DISTRICT_DISPLAY_NAMES } from '@/constants/cities'
import {
  isAdminLocalFeatured,
  isKibrisScopedNews,
  isLocalScopedNews,
  isNationalFeaturedEligible,
} from '@/lib/featuredScope'
import { provinceOf, type AutomationRule, type AutomationRuleInput, type FeaturedKind } from './types'

/** The news fields a rule may look at. Built by `newsFactsFrom` from a Firestore doc. */
export interface NewsFacts {
  id: string
  status: string
  publishedAt: number | null
  citySlug: string
  districtSlug: string
  categoryId: string
  originalCategoryId: string
  featured: boolean
  localFeatured: boolean
}

export function newsFactsFrom(id: string, d: Record<string, unknown>): NewsFacts {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim().toLowerCase() : '')
  const pa = d.publishedAt
  const publishedAt =
    typeof pa === 'number' && Number.isFinite(pa)
      ? pa
      : pa && typeof (pa as { toMillis?: () => number }).toMillis === 'function'
        ? (pa as { toMillis: () => number }).toMillis()
        : null
  return {
    id,
    status: str(d.status),
    publishedAt,
    citySlug: str(d.citySlug),
    districtSlug: str(d.districtSlug ?? d.district),
    categoryId: str(d.categoryId ?? d.category),
    originalCategoryId: str(d.originalCategoryId),
    featured: d.featured === true || d.isFeatured === true,
    localFeatured: d.localFeatured === true,
  }
}

const CATEGORY_PARENT = new Map(DEFAULT_CATEGORIES.filter((c) => c.parentId).map((c) => [c.id, c.parentId as string]))
const CATEGORY_NAME = new Map(DEFAULT_CATEGORIES.map((c) => [c.id, c.name]))

/** Category + its ancestors (a selected parent matches its subcategories). */
function categoryLineage(id: string): string[] {
  const out: string[] = []
  let cur: string | undefined = id
  for (let i = 0; cur && i < 6 && !out.includes(cur); i++) {
    out.push(cur)
    cur = CATEGORY_PARENT.get(cur)
  }
  return out
}

export function categoryLabel(id: string): string {
  return CATEGORY_NAME.get(id) ?? id
}

function provinceLabel(slug: string): string {
  try {
    return getCityCategoryName(slug) || slug
  } catch {
    return slug
  }
}

function isNationalNews(n: NewsFacts): boolean {
  const scope = { citySlug: n.citySlug, categoryId: n.categoryId, originalCategoryId: n.originalCategoryId }
  return !isLocalScopedNews(scope) && !isKibrisScopedNews(scope)
}

function geoMatch(rule: Pick<AutomationRuleInput, 'geo'>, n: NewsFacts): { ok: boolean; reason: string } {
  const g = rule.geo
  const prov = provinceOf(n.citySlug)
  switch (g.kind) {
    case 'any':
      return { ok: true, reason: 'Konum: tüm haberler' }
    case 'national':
      return isNationalNews(n)
        ? { ok: true, reason: 'Konum: ulusal haber' }
        : { ok: false, reason: 'Ulusal haber değil (yerel / Kıbrıs kapsamlı)' }
    case 'provinces':
      return g.citySlugs.includes(prov)
        ? { ok: true, reason: `Konum: ${provinceLabel(prov)}` }
        : { ok: false, reason: prov ? `İl eşleşmedi (${provinceLabel(prov)})` : 'Haberde il bilgisi yok' }
    case 'districts': {
      if (prov !== g.citySlug) return { ok: false, reason: prov ? `İl eşleşmedi (${provinceLabel(prov)})` : 'Haberde il bilgisi yok' }
      // Old records: district slug stored as citySlug.
      const district = n.districtSlug || (n.citySlug !== prov ? n.citySlug : '')
      return g.districtSlugs.includes(district)
        ? { ok: true, reason: `Konum: ${provinceLabel(prov)} / ${DISTRICT_DISPLAY_NAMES[district] ?? district}` }
        : { ok: false, reason: district ? `İlçe eşleşmedi (${DISTRICT_DISPLAY_NAMES[district] ?? district})` : 'Haberde ilçe bilgisi yok' }
    }
  }
}

function categoryMatch(rule: Pick<AutomationRuleInput, 'categoryIds' | 'allCategories'>, n: NewsFacts): { ok: boolean; reason: string } {
  if (rule.allCategories) return { ok: true, reason: 'Kategori: tümü' }
  const ids = new Set([...categoryLineage(n.categoryId), ...(n.originalCategoryId ? categoryLineage(n.originalCategoryId) : [])])
  const hit = rule.categoryIds.find((c) => ids.has(c))
  return hit
    ? { ok: true, reason: `Kategori: ${categoryLabel(hit)}` }
    : { ok: false, reason: `Kategori seçili değil (${categoryLabel(n.categoryId || '—')})` }
}

export function isFeaturedFor(kind: FeaturedKind, n: NewsFacts): { national: boolean; local: boolean; ok: boolean } {
  const scope = { citySlug: n.citySlug, categoryId: n.categoryId, originalCategoryId: n.originalCategoryId }
  const national = n.featured && isNationalFeaturedEligible(scope)
  const local = isAdminLocalFeatured({ ...scope, featured: n.featured, localFeatured: n.localFeatured })
  const ok = kind === 'national' ? national : kind === 'local' ? local : national || local
  return { national, local, ok }
}

function featuredMatch(rule: Pick<AutomationRuleInput, 'featuredKind'>, n: NewsFacts): { ok: boolean; reason: string } {
  const f = isFeaturedFor(rule.featuredKind, n)
  if (f.ok) return { ok: true, reason: f.national && f.local ? 'Öne çıkan (ulusal + yerel)' : f.national ? 'Öne çıkan (ulusal)' : 'Öne çıkan (yerel)' }
  return { ok: false, reason: 'Öne çıkan değil' }
}

export interface RuleEvaluation {
  match: boolean
  reasons: string[]
}

/**
 * Content + geo match only. Status / publish time / account / limits are
 * checked separately (eligibility) so preview can explain each layer.
 */
export function evaluateRuleConditions(rule: AutomationRuleInput, n: NewsFacts): RuleEvaluation {
  const geo = geoMatch(rule, n)
  if (!geo.ok) return { match: false, reasons: [geo.reason] }
  const reasons = [geo.reason]
  switch (rule.featuredMode) {
    case 'categories_only': {
      const c = categoryMatch(rule, n)
      return { match: c.ok, reasons: [...reasons, c.reason] }
    }
    case 'featured_only': {
      const f = featuredMatch(rule, n)
      return { match: f.ok, reasons: [...reasons, f.reason] }
    }
    case 'categories_or_featured': {
      const c = categoryMatch(rule, n)
      const f = featuredMatch(rule, n)
      return { match: c.ok || f.ok, reasons: [...reasons, c.ok ? c.reason : f.ok ? f.reason : `${c.reason}; ${f.reason}`] }
    }
    case 'featured_in_categories': {
      const c = categoryMatch(rule, n)
      if (!c.ok) return { match: false, reasons: [...reasons, c.reason] }
      const f = featuredMatch(rule, n)
      return { match: f.ok, reasons: [...reasons, c.reason, f.reason] }
    }
  }
}

/** Full check used by reconcile and the pre-send recheck. */
export function evaluateRule(rule: AutomationRule, n: NewsFacts): RuleEvaluation {
  if (!rule.enabled || rule.enabledAt === null) return { match: false, reasons: ['Kural kapalı'] }
  if (n.status !== 'published') return { match: false, reasons: ['Haber yayında değil'] }
  if (n.publishedAt === null) return { match: false, reasons: ['Yayın zamanı yok'] }
  if (n.publishedAt < rule.enabledAt) return { match: false, reasons: ['Kural açılmadan önce yayımlanmış (geriye dönük paylaşım yok)'] }
  return evaluateRuleConditions(rule, n)
}

const MODE_TEXT: Record<AutomationRuleInput['featuredMode'], string> = {
  categories_only: 'seçilen kategoriler',
  featured_only: 'yalnızca öne çıkanlar',
  categories_or_featured: 'seçilen kategoriler VEYA öne çıkanlar',
  featured_in_categories: 'seçilen kategorilerde YALNIZCA öne çıkanlar',
}
const KIND_TEXT: Record<FeaturedKind, string> = { national: 'ulusal manşet', local: 'il manşeti', either: 'ulusal veya il manşeti' }

/** Human-readable AND/OR summary shown on the rule card and in the confirm step. */
export function summarizeRule(rule: AutomationRuleInput): string {
  const g = rule.geo
  const geo =
    g.kind === 'any'
      ? 'Tüm haberler (il ayrımı yok)'
      : g.kind === 'national'
        ? 'Ulusal haberler'
        : g.kind === 'provinces'
          ? `İl: ${g.citySlugs.map(provinceLabel).join(', ')}`
          : `İlçe: ${provinceLabel(g.citySlug)} / ${g.districtSlugs.map((d) => DISTRICT_DISPLAY_NAMES[d] ?? d).join(', ')}`
  const cats = rule.allCategories ? 'tüm kategoriler' : rule.categoryIds.map(categoryLabel).join(', ')
  let content: string
  switch (rule.featuredMode) {
    case 'categories_only':
      content = `Kategori: ${cats}`
      break
    case 'featured_only':
      content = `Öne çıkan (${KIND_TEXT[rule.featuredKind]})`
      break
    case 'categories_or_featured':
      content = `(Kategori: ${cats}) VEYA öne çıkan (${KIND_TEXT[rule.featuredKind]})`
      break
    case 'featured_in_categories':
      content = `Kategori: ${cats} VE öne çıkan (${KIND_TEXT[rule.featuredKind]})`
      break
  }
  const formats = rule.formats.map((f) => (f === 'post' ? 'gönderi' : 'hikâye')).join(' + ')
  const quiet = rule.quietHours
    ? ` · sessiz saat ${String(rule.quietHours.startHour).padStart(2, '0')}:00–${String(rule.quietHours.endHour).padStart(2, '0')}:00`
    : ''
  return `${geo} VE ${content} → ${formats} · günde en fazla ${rule.dailyLimit} · en az ${rule.minIntervalMinutes} dk ara${quiet}`
}

export { MODE_TEXT as FEATURED_MODE_TEXT }
