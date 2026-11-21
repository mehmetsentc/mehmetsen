/**
 * «Sosyal hesaplar» list view — pure derivations used by the admin accounts
 * workspace (and its tests). No I/O: everything is computed from the rows the
 * API already returned for the signed-in user (/api/social/accounts + rules),
 * so summary counts always cover every account the user may see, never only
 * the page on screen, and no per-account query is ever needed.
 */
import type { AutomationGeo } from '../automation/types'

export type ListPlatform = 'facebook' | 'instagram' | 'threads' | 'youtube' | 'tiktok'

/** Minimal shape of a row (subset of SocialAccountRow, kept structural for tests). */
export interface ListAccount {
  id: string
  platform: ListPlatform
  displayName: string
  username: string | null
  ownerKind: 'user' | 'publisher' | 'central' | 'province'
  ownership: { citySlug: string | null; publisherId: string | null }
  connectionMethod: string
  status: 'active' | 'paused' | 'needs_reauth' | 'disabled'
  tokenExpiresAt: number | null
  connectionCheckedAt: number | null
  health: { publishBlocker: string | null; tokenWarning: boolean }
  publishScope?: { geo: AutomationGeo; allCategories: boolean; categoryIds: string[] }
}

export interface ListRule {
  accountId: string
  enabled: boolean
}

/**
 * Connection / publish state shown in the «Durum» column. Derived only from
 * the account's real stored state + the server's publish blocker:
 *   - ready          active, no blocker for any supported format
 *   - expiring       ready today, but access ends within 7 days and is not auto-renewed
 *   - reconnect      needs_reauth / token expired / publish permission missing
 *   - unverified     publish permission could not be verified (never shown as healthy)
 *   - limited        another publish blocker (e.g. format)
 *   - paused         deliberately paused by a manager
 *   - disconnected   connection removed (disabled)
 */
export type AccountState = 'ready' | 'expiring' | 'reconnect' | 'unverified' | 'limited' | 'paused' | 'disconnected'

const RECONNECT_BLOCKERS = new Set(['token_expired', 'status_needs_reauth', 'publish_permission_missing'])
/** Instagram Login / Threads tokens are renewed by the shared automation tick. */
const AUTO_RENEWED = new Set(['instagram_login', 'threads_oauth'])

export function accountState(a: ListAccount): AccountState {
  if (a.status === 'disabled') return 'disconnected'
  if (a.status === 'needs_reauth') return 'reconnect'
  const b = a.health.publishBlocker
  if (b && RECONNECT_BLOCKERS.has(b)) return 'reconnect'
  if (a.status === 'paused' || b === 'status_paused') return 'paused'
  if (b === 'publish_permission_unverified') return 'unverified'
  if (b) return 'limited'
  if (a.health.tokenWarning && !AUTO_RENEWED.has(a.connectionMethod)) return 'expiring'
  return 'ready'
}

export const STATE_LABEL: Record<AccountState, string> = {
  ready: 'Hazır',
  expiring: 'Süre doluyor',
  reconnect: 'Yeniden bağla',
  unverified: 'Doğrulanmadı',
  limited: 'Yayın kısıtlı',
  paused: 'Duraklatıldı',
  disconnected: 'Bağlı değil',
}

/** Needs a manager's action (drives «İşlem gerekli» and the default sort). */
export function needsAction(s: AccountState): boolean {
  return s === 'reconnect' || s === 'unverified' || s === 'limited' || s === 'expiring'
}

/** Publishable right now (drives «Yayına hazır»). An expiring account is still publishable. */
export function isReady(s: AccountState): boolean {
  return s === 'ready' || s === 'expiring'
}

/** Most urgent first; used for the status sort and inside «İşlem gerekli». */
const STATE_RANK: Record<AccountState, number> = { reconnect: 0, unverified: 1, limited: 2, expiring: 3, paused: 4, ready: 5, disconnected: 6 }

// ── Content scope (separate from ownership) ─────────────────────────────────

export type ScopeKind = 'general' | 'region' | 'province' | 'category' | 'location_category'

export const SCOPE_KIND_LABEL: Record<ScopeKind, string> = {
  general: 'Genel',
  region: 'Bölge / çoklu il',
  province: 'İl',
  category: 'Kategori',
  location_category: 'Konum + kategori',
}

/**
 * Classify the account's manual post scope. Wide geos (all news, national,
 * world, every il) count as «Genel»; several provinces as «Bölge / çoklu il»;
 * one province or its districts as «İl». A category restriction on a wide geo
 * is «Kategori», on a local geo «Konum + kategori». Accounts without a scope
 * (legacy) return null.
 */
export function scopeKind(a: Pick<ListAccount, 'publishScope'>): ScopeKind | null {
  const sc = a.publishScope
  if (!sc) return null
  const g = sc.geo
  const local = g.kind === 'provinces' || g.kind === 'districts'
  if (!sc.allCategories) return local ? 'location_category' : 'category'
  if (g.kind === 'provinces') return g.citySlugs.length > 1 ? 'region' : 'province'
  if (g.kind === 'districts') return 'province'
  return 'general'
}

/** Province slugs an account relates to (ownership il + post scope il(ler)) — for search. */
export function accountProvinceSlugs(a: Pick<ListAccount, 'ownership' | 'publishScope'>): string[] {
  const out = new Set<string>()
  if (a.ownership.citySlug) out.add(a.ownership.citySlug)
  const g = a.publishScope?.geo
  if (g?.kind === 'provinces') g.citySlugs.forEach((c) => out.add(c))
  if (g?.kind === 'districts' && g.citySlug) out.add(g.citySlug)
  return [...out]
}

/** Short «Kapsam» column text + full text for the tooltip / screen readers. */
export function scopeSummary(
  a: Pick<ListAccount, 'publishScope'>,
  provinceName: (slug: string) => string,
  categoryNames: (ids: string[]) => string[],
): { short: string; full: string } {
  const sc = a.publishScope
  if (!sc) return { short: '—', full: 'Yayın kapsamı tanımlı değil (eski bağlantı)' }
  const g = sc.geo
  let geoShort: string
  let geoFull: string
  switch (g.kind) {
    case 'any':
      geoShort = 'Genel'
      geoFull = 'Tüm haberler'
      break
    case 'national':
      geoShort = 'Ulusal'
      geoFull = 'Ulusal kategoriler'
      break
    case 'world':
      geoShort = 'Dünya'
      geoFull = 'Dünya haberleri'
      break
    case 'all_provinces':
      geoShort = 'Tüm iller'
      geoFull = 'İl bilgisi olan tüm haberler'
      break
    case 'provinces': {
      const names = g.citySlugs.map(provinceName)
      geoShort = names.length === 0 ? 'İl seçilmedi' : names.length === 1 ? names[0] : `${names.length} il`
      geoFull = names.length ? names.join(', ') : 'İl seçilmedi'
      break
    }
    case 'districts':
      geoShort = `${provinceName(g.citySlug)} · ${g.districtSlugs.length} ilçe`
      geoFull = `${provinceName(g.citySlug)} (${g.districtSlugs.length} ilçe)`
      break
  }
  if (sc.allCategories) return { short: geoShort, full: `${geoFull} · tüm kategoriler` }
  const cats = categoryNames(sc.categoryIds)
  const catShort = cats.length === 0 ? 'kategori yok' : cats.length === 1 ? cats[0] : `${cats.length} kategori`
  const head = g.kind === 'any' ? catShort : `${geoShort} · ${catShort}`
  return { short: head, full: `${geoFull} · ${cats.length ? cats.join(', ') : 'kategori seçilmedi'}` }
}

// ── Search, filters, sort, paging ───────────────────────────────────────────

/** Turkish-aware, diacritic-insensitive fold for search ("Çanakkale" ~ "canakkale", "İzmir" ~ "izmir"). */
export function foldTr(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ş/g, 's')
    .replace(/ü/g, 'u')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^@+/, '')
    .trim()
}

export interface AccountFilters {
  q: string
  platform: '' | ListPlatform
  scope: '' | ScopeKind
  owner: '' | 'central' | 'province' | 'user' | 'publisher'
  /** '' | a single state | 'ready' (incl. expiring) | 'attention' (needsAction) */
  status: '' | 'ready_any' | 'attention' | AccountState
  automation: '' | 'on' | 'off'
}

export const EMPTY_FILTERS: AccountFilters = { q: '', platform: '', scope: '', owner: '', status: '', automation: '' }

export function hasActiveFilters(f: AccountFilters): boolean {
  return !!(f.q.trim() || f.platform || f.scope || f.owner || f.status || f.automation)
}

export type SortKey = 'default' | 'name' | 'platform' | 'status'

export interface AccountView<A extends ListAccount = ListAccount> {
  account: A
  state: AccountState
  scope: ScopeKind | null
  enabledRules: number
}

/** Enabled-rule count per account, from ONE rules list (no per-row query). */
export function enabledRulesByAccount(rules: ListRule[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of rules) if (r.enabled) m.set(r.accountId, (m.get(r.accountId) ?? 0) + 1)
  return m
}

export function buildViews<A extends ListAccount>(accounts: A[], rules: ListRule[]): AccountView<A>[] {
  const byAcc = enabledRulesByAccount(rules)
  return accounts.map((account) => ({ account, state: accountState(account), scope: scopeKind(account), enabledRules: byAcc.get(account.id) ?? 0 }))
}

export interface AccountSummary {
  total: number
  ready: number
  attention: number
  automationOn: number
}

/** Counts over EVERY visible account (never the current page). «Otomasyon açık» counts accounts with ≥1 enabled rule. */
export function summarize(views: AccountView[]): AccountSummary {
  let ready = 0
  let attention = 0
  let automationOn = 0
  for (const v of views) {
    if (isReady(v.state)) ready++
    if (needsAction(v.state)) attention++
    if (v.enabledRules > 0) automationOn++
  }
  return { total: views.length, ready, attention, automationOn }
}

export function matchesFilters(v: AccountView, f: AccountFilters, provinceName: (slug: string) => string): boolean {
  const a = v.account
  if (f.platform && a.platform !== f.platform) return false
  if (f.scope && v.scope !== f.scope) return false
  if (f.owner && a.ownerKind !== f.owner) return false
  if (f.automation === 'on' && v.enabledRules === 0) return false
  if (f.automation === 'off' && v.enabledRules > 0) return false
  if (f.status) {
    if (f.status === 'ready_any') {
      if (!isReady(v.state)) return false
    } else if (f.status === 'attention') {
      if (!needsAction(v.state)) return false
    } else if (v.state !== f.status) return false
  }
  const q = foldTr(f.q)
  if (q) {
    const hay = [a.displayName, a.username ?? '', ...accountProvinceSlugs(a).map(provinceName)].map(foldTr)
    if (!hay.some((h) => h.includes(q))) return false
  }
  return true
}

const collator = new Intl.Collator('tr-TR', { sensitivity: 'base', numeric: true })
const PLATFORM_ORDER: Record<ListPlatform, number> = { instagram: 0, facebook: 1, threads: 2, youtube: 3, tiktok: 4 }

/**
 * Stable sort. Default: accounts needing action first (most urgent first),
 * then everything else in Turkish alphabetical order. Ties always fall back
 * to name, then id, so the order never jumps between renders.
 */
export function sortViews<V extends AccountView>(views: V[], key: SortKey, dir: 'asc' | 'desc' = 'asc'): V[] {
  const byName = (x: V, y: V) => collator.compare(x.account.displayName, y.account.displayName) || (x.account.id < y.account.id ? -1 : x.account.id > y.account.id ? 1 : 0)
  const cmp = (x: V, y: V): number => {
    switch (key) {
      case 'name':
        return byName(x, y)
      case 'platform':
        return PLATFORM_ORDER[x.account.platform] - PLATFORM_ORDER[y.account.platform] || byName(x, y)
      case 'status':
        return STATE_RANK[x.state] - STATE_RANK[y.state] || byName(x, y)
      default: {
        const ax = needsAction(x.state) ? 0 : 1
        const ay = needsAction(y.state) ? 0 : 1
        if (ax !== ay) return ax - ay
        if (ax === 0) return STATE_RANK[x.state] - STATE_RANK[y.state] || byName(x, y)
        return byName(x, y)
      }
    }
  }
  const sorted = [...views].sort(cmp)
  return dir === 'desc' && key !== 'default' ? sorted.reverse() : sorted
}

export const PAGE_SIZES = [25, 50] as const

export function paginate<T>(items: T[], page: number, size: number): { items: T[]; page: number; pages: number; from: number; to: number; total: number } {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / size))
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const start = (p - 1) * size
  const slice = items.slice(start, start + size)
  return { items: slice, page: p, pages, from: total === 0 ? 0 : start + 1, to: start + slice.length, total }
}

/** Page buttons with gaps: [1, '…', 4, 5, 6, '…', 12]. */
export function pageList(page: number, pages: number): Array<number | 'gap'> {
  if (pages <= 7) return Array.from({ length: pages }, (_, i) => i + 1)
  const set = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages))
  const nums = [...set].sort((a, b) => a - b)
  const out: Array<number | 'gap'> = []
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push('gap')
    out.push(n)
  })
  return out
}

/** Avatar fallback: up to two initials of the display name (Turkish upper-case). */
export function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const pick = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0]
  return pick.toLocaleUpperCase('tr-TR')
}

// ── Edit safety helpers ─────────────────────────────────────────────────────

/**
 * Guards async loads for «the account currently on screen»: a response that
 * arrives after the user switched to another account (or closed the panel)
 * is dropped instead of overwriting the new panel.
 */
export function createLatestGuard() {
  let current = 0
  return {
    begin(): number {
      current += 1
      return current
    },
    isCurrent(token: number): boolean {
      return token === current
    },
    cancel(): void {
      current += 1
    },
  }
}

/** Ask before discarding unsaved edits; returns true when it is safe to continue. */
export function confirmDiscard(dirty: boolean, ask: (message: string) => boolean): boolean {
  if (!dirty) return true
  return ask('Kaydedilmemiş değişiklikler var. Kaydetmeden çıkılsın mı?')
}

/** Order-insensitive deep compare of a scope draft (so re-selecting the same values is not «dirty»). */
export function sameDraft(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b)
}

function stableStringify(v: unknown): string {
  if (Array.isArray(v)) {
    const parts = v.map(stableStringify)
    return `[${v.every((x) => typeof x === 'string') ? parts.sort().join(',') : parts.join(',')}]`
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(v)
}
