'use client'

/**
 * «Sosyal hesaplar» — compact account list + selected account's detail panel.
 *
 * Data: exactly the existing calls, once per page load —
 *   /api/social/me, /api/social/accounts (every account the user may see,
 *   server-filtered by role), /api/social/rules (one list for all accounts).
 * Summary cards, filters, sort and paging are computed client-side over that
 * full authorised set, so totals never reflect only the page on screen and no
 * per-row query is made. No platform is contacted on page load; history is
 * loaded only when an account's «Geçmiş» tab is opened.
 */
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronLeft, ChevronRight, Filter, MoreHorizontal, Plus, RefreshCw, Search, Settings2, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import { SocialAccountsManager, type ReturnedAccount } from '@/components/social/SocialAccountsManager'
import { CATEGORY_NAME } from '@/components/social/CategoryPicker'
import { socialApi, type SocialAccountRow, type SocialMe } from '@/components/social/socialClient'
import {
  EMPTY_FILTERS,
  PAGE_SIZES,
  SCOPE_KIND_LABEL,
  STATE_LABEL,
  buildViews,
  confirmDiscard,
  createLatestGuard,
  hasActiveFilters,
  matchesFilters,
  pageList,
  paginate,
  scopeSummary,
  sortViews,
  summarize,
  type AccountFilters,
  type AccountView,
  type ScopeKind,
  type SortKey,
} from '@/lib/social/accounts/accountListView'
import { AccountDetailPanel, type DetailTab, type RuleRow } from './AccountDetailPanel'
import { AccountAvatar, AutomationPill, PLATFORM_NAME, PlatformLabel, StatePill, provinceName } from './accountUi'
import { startReconnect } from './accountActions'

type View = AccountView<SocialAccountRow>
type Selected = { id: string; tab: DetailTab; returned: { district: string | null; prefill: ReturnedAccount['prefill'] } | null; nonce: number }

const categoryNames = (ids: string[]) => ids.map((id) => CATEGORY_NAME.get(id) ?? id)

/** Media query hook (SSR-safe; false until mounted). */
function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

const selectCls =
  'h-11 min-w-0 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 text-base text-[rgb(var(--color-text))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-brand))] sm:h-10 sm:text-sm'

export function SocialAccountsWorkspace() {
  const [me, setMe] = useState<SocialMe | null>(null)
  const [accounts, setAccounts] = useState<SocialAccountRow[]>([])
  const [rules, setRules] = useState<RuleRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<AccountFilters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'default', dir: 'asc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState<number>(25)
  const [selected, setSelected] = useState<Selected | null>(null)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const dirtyRef = useRef(false)
  const openerRef = useRef<HTMLElement | null>(null)
  const listGuard = useRef(createLatestGuard())
  const docked = useMedia('(min-width: 1280px)')
  const desktopTable = useMedia('(min-width: 768px)')
  const deferredQ = useDeferredValue(filters.q)

  // ── Data ──────────────────────────────────────────────────────────────────
  const load = useCallback(async (what: 'all' | 'accounts' = 'all') => {
    const t = listGuard.current.begin()
    if (what === 'all') setError(null)
    const [m, a, r] = await Promise.all([
      what === 'all' ? socialApi<SocialMe>('/api/social/me') : Promise.resolve(null),
      socialApi<{ accounts: SocialAccountRow[] }>('/api/social/accounts'),
      what === 'all' ? socialApi<{ rules: RuleRow[] }>('/api/social/rules') : Promise.resolve(null),
    ])
    if (!listGuard.current.isCurrent(t)) return
    if (m && !m.ok) setError(m.status === 401 ? 'Sosyal hesaplar için giriş yapın.' : m.error)
    else if (m?.ok) setMe(m.data)
    if (a.ok) setAccounts(a.data.accounts)
    // A failed refresh keeps the list on screen; only a failed first load shows the error state.
    else if (what === 'accounts') toast.error(`Hesap listesi yenilenemedi: ${a.error}`)
    else setError(a.status === 401 ? 'Sosyal hesaplar için giriş yapın.' : `Hesaplar yüklenemedi: ${a.error}`)
    if (r?.ok) setRules(r.data.rules ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load('all')
  }, [load])

  // Leaving the page with unsaved scope edits asks first.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // ── Derived list ──────────────────────────────────────────────────────────
  const views = useMemo(() => buildViews(accounts, rules), [accounts, rules])
  const summary = useMemo(() => summarize(views), [views])
  const effectiveFilters = useMemo(() => ({ ...filters, q: deferredQ }), [filters, deferredQ])
  const filtered = useMemo(() => views.filter((v) => matchesFilters(v, effectiveFilters, provinceName)), [views, effectiveFilters])
  const sorted = useMemo(() => sortViews(filtered, sort.key, sort.dir), [filtered, sort])
  const paged = useMemo(() => paginate(sorted, page, pageSize), [sorted, page, pageSize])
  const active = hasActiveFilters(filters)
  const extraFilterCount = [filters.platform, filters.scope, filters.owner, filters.status, filters.automation].filter(Boolean).length

  // Filters / sort changes go back to page 1 (a shrunk list never leaves you on an empty page).
  useEffect(() => {
    setPage(1)
  }, [effectiveFilters, sort, pageSize])

  const setFilter = <K extends keyof AccountFilters>(k: K, v: AccountFilters[K]) => setFilters((f) => ({ ...f, [k]: v }))
  const clearFilters = () => setFilters(EMPTY_FILTERS)

  // ── Selection / panel ─────────────────────────────────────────────────────
  const selectedView = selected ? views.find((v) => v.account.id === selected.id) ?? null : null
  // Account vanished after a reload (no longer visible) → close the panel. Not for an
  // account just returned from the platform login: its row may still be loading.
  useEffect(() => {
    if (selected && !selected.returned && !loading && !selectedView && accounts.length > 0) setSelected(null)
  }, [selected, selectedView, loading, accounts.length])

  const canLeave = () => confirmDiscard(dirtyRef.current, (m) => window.confirm(m))

  const openAccount = (id: string, tab: DetailTab = 'general', opener?: HTMLElement | null) => {
    if (selected?.id === id && selected.tab === tab) return
    // Any switch (other account, or another tab via the row menu) remounts the panel → ask first.
    if (selected && !canLeave()) return
    dirtyRef.current = false
    if (opener) openerRef.current = opener
    setSelected((s) => ({ id, tab, returned: null, nonce: (s?.nonce ?? 0) + 1 }))
  }

  const closePanel = useCallback(() => {
    if (!confirmDiscard(dirtyRef.current, (m) => window.confirm(m))) return
    dirtyRef.current = false
    setSelected(null)
    const el = openerRef.current
    if (el && document.contains(el)) requestAnimationFrame(() => el.focus())
  }, [])

  const onDirtyChange = useCallback((d: boolean) => {
    dirtyRef.current = d
  }, [])

  const onAccountReturned = useCallback(
    (r: ReturnedAccount) => {
      dirtyRef.current = false
      setSelected((s) => ({ id: r.id, tab: 'scope', returned: { district: r.district, prefill: r.prefill }, nonce: (s?.nonce ?? 0) + 1 }))
      void load('accounts')
    },
    [load],
  )

  // Escape closes the panel (with the unsaved-changes check).
  useEffect(() => {
    if (!selectedView) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const t = e.target as HTMLElement | null
      if (t?.closest('[role="menu"]')) return
      closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selectedView, closePanel])

  const overlay = !!selectedView && !docked

  // Drawer mode: lock page scroll behind it.
  useEffect(() => {
    if (!overlay) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [overlay])

  const toggleSort = (key: Exclude<SortKey, 'default'>) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))

  const cardFilter = (kind: 'total' | 'ready' | 'attention' | 'automation') => {
    if (kind === 'total') setFilters((f) => ({ ...f, status: '', automation: '' }))
    else if (kind === 'ready') setFilters((f) => ({ ...f, status: f.status === 'ready_any' ? '' : 'ready_any' }))
    else if (kind === 'attention') setFilters((f) => ({ ...f, status: f.status === 'attention' ? '' : 'attention' }))
    else setFilters((f) => ({ ...f, automation: f.automation === 'on' ? '' : 'on' }))
  }

  // Every signed-in user can at least add a personal account (same choices as the wizard).
  const canAdd = !!me

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <AdminOsPageShell
      title="Sosyal hesaplar"
      subtitle="Tüm hesaplarını tek yerden yönet"
      actions={
        canAdd ? (
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            aria-expanded={wizardOpen}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90 sm:px-4"
          >
            <Plus className="h-4 w-4" aria-hidden /> <span>Yeni hesap ekle</span>
          </button>
        ) : null
      }
    >
      <SocialAdminNav />

      {/* Existing connect flow: result banner, Facebook page choice, «Yeni hesap ekle» wizard (OAuth). */}
      {!loading && (
        <SocialAccountsManager
          mode="admin"
          connectOnly
          me={me}
          wizardOpen={wizardOpen}
          onWizardOpenChange={setWizardOpen}
          onAccountReturned={onAccountReturned}
          onAccountsChanged={() => void load('accounts')}
        />
      )}

      {/* Summary cards (whole authorised set) */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4" aria-label="Hesap özeti">
        <SummaryCard label="Toplam hesap" value={summary.total} loading={loading} icon={<Users className="h-5 w-5" aria-hidden />} tone="brand" pressed={!filters.status && !filters.automation && !!active} onClick={() => cardFilter('total')} hint="Durum ve otomasyon filtresini kaldır" />
        <SummaryCard label="Yayına hazır" value={summary.ready} loading={loading} icon={<CheckCircle2 className="h-5 w-5" aria-hidden />} tone="ok" pressed={filters.status === 'ready_any'} onClick={() => cardFilter('ready')} hint="Yalnız yayına hazır hesapları göster" />
        <SummaryCard label="İşlem gerekli" value={summary.attention} loading={loading} icon={<AlertTriangle className="h-5 w-5" aria-hidden />} tone="warn" pressed={filters.status === 'attention'} onClick={() => cardFilter('attention')} hint="Yeniden bağlantı, doğrulanmamış izin veya süresi dolmak üzere olan hesaplar" />
        <SummaryCard label="Otomasyon açık" value={summary.automationOn} loading={loading} icon={<Settings2 className="h-5 w-5" aria-hidden />} tone="ok" pressed={filters.automation === 'on'} onClick={() => cardFilter('automation')} hint="En az bir açık kuralı olan hesaplar" />
      </div>

      <div className={cn('grid gap-4', selectedView && docked && 'grid-cols-[minmax(0,1fr)_minmax(380px,440px)]')}>
        <div className="min-w-0 space-y-3">
          {/* Search + filters */}
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <label className="relative min-w-0 flex-1 lg:max-w-md">
              <span className="sr-only">Hesaplarda ara</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[rgb(var(--color-muted))]" aria-hidden />
              <input
                type="search"
                value={filters.q}
                onChange={(e) => setFilter('q', e.target.value)}
                placeholder="Hesap veya kullanıcı adı ara…"
                autoComplete="off"
                enterKeyHint="search"
                className="h-11 w-full rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] pl-9 pr-3 text-base text-[rgb(var(--color-text))] placeholder:text-[rgb(var(--color-muted))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-brand))] sm:h-10 sm:text-sm"
              />
            </label>
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              aria-controls="social-account-filters"
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] px-3 text-sm font-semibold md:hidden"
            >
              <Filter className="h-4 w-4" aria-hidden /> Filtreler{extraFilterCount ? ` (${extraFilterCount})` : ''}
            </button>
            <div id="social-account-filters" className={cn('grid grid-cols-2 gap-2 md:flex md:flex-wrap md:items-center lg:ml-auto lg:justify-end', !filtersOpen && 'max-md:hidden')} aria-label="Hesap filtreleri" role="group">
              <select aria-label="Platform" value={filters.platform} onChange={(e) => setFilter('platform', e.target.value as AccountFilters['platform'])} className={selectCls}>
                <option value="">Platform: tümü</option>
                {(['instagram', 'facebook', 'threads', 'youtube', 'tiktok'] as const).map((p) => (
                  <option key={p} value={p}>
                    {PLATFORM_NAME[p]}
                  </option>
                ))}
              </select>
              <select aria-label="İçerik kapsamı" value={filters.scope} onChange={(e) => setFilter('scope', e.target.value as AccountFilters['scope'])} className={selectCls}>
                <option value="">Kapsam: tümü</option>
                {(Object.keys(SCOPE_KIND_LABEL) as ScopeKind[]).map((k) => (
                  <option key={k} value={k}>
                    {SCOPE_KIND_LABEL[k]}
                  </option>
                ))}
              </select>
              <select aria-label="Sahiplik" value={filters.owner} onChange={(e) => setFilter('owner', e.target.value as AccountFilters['owner'])} className={selectCls}>
                <option value="">Sahiplik: tümü</option>
                <option value="central">Merkez</option>
                <option value="province">İl ekibi</option>
                <option value="user">Kişisel</option>
                <option value="publisher">Yayıncı</option>
              </select>
              <select aria-label="Bağlantı ve yayın durumu" value={filters.status} onChange={(e) => setFilter('status', e.target.value as AccountFilters['status'])} className={selectCls}>
                <option value="">Durum: tümü</option>
                <option value="ready_any">Yayına hazır</option>
                <option value="attention">İşlem gerekli</option>
                {(['reconnect', 'unverified', 'expiring', 'limited', 'paused', 'disconnected'] as const).map((s) => (
                  <option key={s} value={s}>
                    {STATE_LABEL[s]}
                  </option>
                ))}
              </select>
              <select aria-label="Otomasyon" value={filters.automation} onChange={(e) => setFilter('automation', e.target.value as AccountFilters['automation'])} className={selectCls}>
                <option value="">Otomasyon: tümü</option>
                <option value="on">Açık</option>
                <option value="off">Kapalı</option>
              </select>
              <select
                aria-label="Sıralama"
                value={sort.key === 'default' ? 'default' : `${sort.key}:${sort.dir}`}
                onChange={(e) => {
                  const [key, dir] = e.target.value.split(':') as [SortKey, 'asc' | 'desc' | undefined]
                  setSort({ key, dir: dir ?? 'asc' })
                }}
                className={cn(selectCls, 'md:hidden')}
              >
                <option value="default">Sıra: önce işlem gerekenler</option>
                <option value="name:asc">Ada göre (A–Z)</option>
                <option value="name:desc">Ada göre (Z–A)</option>
                <option value="platform:asc">Platforma göre</option>
                <option value="status:asc">Duruma göre</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p aria-live="polite" className="text-[rgb(var(--color-muted))]">
              {loading ? 'Hesaplar yükleniyor…' : active ? `${filtered.length} / ${views.length} hesap eşleşti` : `${views.length} hesap`}
            </p>
            <div className="flex items-center gap-3">
              {sort.key !== 'default' && (
                <button type="button" onClick={() => setSort({ key: 'default', dir: 'asc' })} className="text-xs font-semibold text-[rgb(var(--color-muted))] underline">
                  Varsayılan sıralama
                </button>
              )}
              {active && (
                <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-sm font-semibold text-[rgb(var(--color-brand))]">
                  <X className="h-4 w-4" aria-hidden /> Filtreleri temizle
                </button>
              )}
            </div>
          </div>

          {/* List */}
          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              <span className="flex-1">{error}</span>
              <button type="button" onClick={() => void load('all')} className="inline-flex items-center gap-1 font-semibold underline">
                <RefreshCw className="h-4 w-4" aria-hidden /> Tekrar dene
              </button>
            </div>
          ) : loading ? (
            <ListSkeleton />
          ) : views.length === 0 ? (
            <EmptyState title="Henüz bağlı hesap yok" text="İlk hesabı «Yeni hesap ekle» ile platformun kendi giriş ekranından bağlayın." action={<button type="button" onClick={() => setWizardOpen(true)} className="rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-semibold text-white">Yeni hesap ekle</button>} />
          ) : filtered.length === 0 ? (
            <EmptyState title="Eşleşen hesap yok" text="Arama ya da filtrelerle eşleşen hesap bulunamadı." action={<button type="button" onClick={clearFilters} className="rounded-lg border border-[rgb(var(--color-border))] px-4 py-2 text-sm font-semibold">Filtreleri temizle</button>} />
          ) : desktopTable ? (
            <AccountTable rows={paged.items} selectedId={selected?.id ?? null} sort={sort} onSort={toggleSort} onOpen={openAccount} compact={!!selectedView && docked} />
          ) : (
            <ul className="space-y-2" aria-label="Sosyal hesaplar">
              {paged.items.map((v) => (
                <AccountCard key={v.account.id} v={v} selected={selected?.id === v.account.id} onOpen={openAccount} />
              ))}
            </ul>
          )}

          {!loading && !error && filtered.length > 0 && (
            <Pager page={paged.page} pages={paged.pages} from={paged.from} to={paged.to} total={paged.total} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
          )}

          <p className="text-xs text-[rgb(var(--color-muted))]">
            Kişisel hesaplar yalnızca sahibine görünür. Yayıncı hesapları merkezde salt okunur listelenir; yönetimi yayıncı ekibindedir. Sayılar görmeye yetkili olduğunuz bütün hesaplardan hesaplanır.
          </p>
        </div>

        {/* Docked detail panel (wide screens) */}
        {selected && selectedView && docked && (
          <aside aria-label="Hesap ayrıntıları" className="sticky top-4 h-[calc(100dvh-7rem)] min-h-[28rem] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] shadow-sm">
            <AccountDetailPanel
              key={`${selected.id}:${selected.nonce}`}
              account={selectedView.account}
              state={selectedView.state}
              rules={rules}
              me={me}
              overlay={false}
              initialTab={selected.tab}
              returned={selected.returned}
              onRequestClose={closePanel}
              onDirtyChange={onDirtyChange}
              onChanged={(what) => void load(what ?? 'all')}
            />
          </aside>
        )}
      </div>

      {/* Drawer (medium / mobile): full screen on phones */}
      {selected && selectedView && !docked && (
        <Drawer onBackdrop={closePanel}>
          <AccountDetailPanel
            key={`${selected.id}:${selected.nonce}`}
            account={selectedView.account}
            state={selectedView.state}
            rules={rules}
            me={me}
            overlay
            initialTab={selected.tab}
            returned={selected.returned}
            onRequestClose={closePanel}
            onDirtyChange={onDirtyChange}
            onChanged={(what) => void load(what ?? 'all')}
          />
        </Drawer>
      )}
    </AdminOsPageShell>
  )
}

// ── Pieces ──────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, loading, icon, tone, pressed, onClick, hint }: { label: string; value: number; loading: boolean; icon: React.ReactNode; tone: 'brand' | 'ok' | 'warn'; pressed: boolean; onClick: () => void; hint: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={hint}
      className={cn(
        'flex min-h-[4.5rem] items-center gap-3 rounded-2xl border bg-[rgb(var(--color-card))] p-3 text-left transition hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-brand))] sm:p-4',
        pressed ? 'border-[rgb(var(--color-brand))] ring-1 ring-[rgb(var(--color-brand))]' : 'border-[rgb(var(--color-border))]',
      )}
    >
      <span
        className={cn(
          'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
          tone === 'brand' && 'bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]',
          tone === 'ok' && 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          tone === 'warn' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-[rgb(var(--color-muted))] sm:text-sm">{label}</span>
        <span className="block text-2xl font-bold leading-tight text-[rgb(var(--color-text))]">{loading ? '–' : value}</span>
      </span>
    </button>
  )
}

function SortHeader({ label, k, sort, onSort, className }: { label: string; k: Exclude<SortKey, 'default'>; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: Exclude<SortKey, 'default'>) => void; className?: string }) {
  const on = sort.key === k
  return (
    <th scope="col" aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn('px-3 py-2.5 text-left font-semibold', className)}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 rounded hover:text-[rgb(var(--color-text))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-brand))]">
        {label}
        {on ? sort.dir === 'asc' ? <ArrowUp className="h-3.5 w-3.5" aria-hidden /> : <ArrowDown className="h-3.5 w-3.5" aria-hidden /> : null}
      </button>
    </th>
  )
}

function ReconnectButton({ a, compact }: { a: SocialAccountRow; compact?: boolean }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await startReconnect(a)
        } finally {
          setBusy(false)
        }
      }}
      className={cn('inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50', compact && 'px-2')}
    >
      <RefreshCw className="h-3.5 w-3.5" aria-hidden />
      {compact ? <span className="sr-only">Yeniden bağla — {a.displayName}</span> : <span>Yeniden bağla</span>}
    </button>
  )
}

const showReconnect = (v: View) => v.state === 'reconnect' && v.account.canManage && v.account.connectionMethod !== 'legacy'

function AccountTable({ rows, selectedId, sort, onSort, onOpen, compact }: { rows: View[]; selectedId: string | null; sort: { key: SortKey; dir: 'asc' | 'desc' }; onSort: (k: Exclude<SortKey, 'default'>) => void; onOpen: (id: string, tab?: DetailTab, opener?: HTMLElement | null) => void; compact: boolean }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
      <table className="w-full table-fixed border-collapse text-sm">
        <caption className="sr-only">Sosyal hesaplar — sütun başlıklarıyla sıralanabilir</caption>
        <colgroup>
          <col className={compact ? 'w-[38%]' : 'w-[30%]'} />
          <col className={compact ? 'w-[17%]' : 'w-[14%]'} />
          {!compact && <col className="w-[16%]" />}
          <col className={compact ? 'w-[18%]' : 'w-[14%]'} />
          {!compact && <col className="w-[13%]" />}
          <col className={compact ? 'w-[27%]' : 'w-[13%]'} />
        </colgroup>
        <thead className="bg-[rgb(var(--color-surface))] text-xs text-[rgb(var(--color-muted))]">
          <tr>
            <SortHeader label="Hesap" k="name" sort={sort} onSort={onSort} />
            <SortHeader label="Platform" k="platform" sort={sort} onSort={onSort} />
            {!compact && (
              <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                Kapsam
              </th>
            )}
            <SortHeader label="Durum" k="status" sort={sort} onSort={onSort} />
            {!compact && (
              <th scope="col" className="px-3 py-2.5 text-left font-semibold">
                Otomasyon
              </th>
            )}
            <th scope="col" className="px-3 py-2.5 text-right font-semibold">
              <span className="sr-only">İşlemler</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[rgb(var(--color-border))]">
          {rows.map((v) => {
            const a = v.account
            const sc = scopeSummary(a, provinceName, categoryNames)
            const isSel = selectedId === a.id
            return (
              <tr key={a.id} className={cn('transition-colors', isSel ? 'bg-[rgb(var(--color-brand))]/[0.07]' : 'hover:bg-[rgb(var(--color-surface))]')}>
                <td className="px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <AccountAvatar name={a.displayName} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[rgb(var(--color-text))]" title={a.displayName}>
                        {a.displayName}
                      </p>
                      <p className="truncate text-xs text-[rgb(var(--color-muted))]" title={a.username ? `@${a.username}` : undefined}>
                        {a.username ? `@${a.username}` : '—'}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <PlatformLabel platform={a.platform} />
                </td>
                {!compact && (
                  <td className="px-3 py-2.5">
                    <span className="block truncate" title={sc.full}>
                      {sc.short}
                      <span className="sr-only"> — {sc.full}</span>
                    </span>
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <StatePill state={v.state} title={a.statusReason ?? undefined} />
                  {v.state === 'ready' && !a.connectionCheckedAt && a.connectionMethod !== 'legacy' ? <span className="mt-0.5 block text-[11px] text-[rgb(var(--color-muted))]">kontrol edilmedi</span> : null}
                </td>
                {!compact && (
                  <td className="px-3 py-2.5">
                    <AutomationPill count={v.enabledRules} />
                  </td>
                )}
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1.5">
                    {showReconnect(v) && <ReconnectButton a={a} compact={compact} />}
                    <button
                      type="button"
                      onClick={(e) => onOpen(a.id, 'general', e.currentTarget)}
                      aria-label={`${a.displayName} hesabını yönet`}
                      aria-pressed={isSel}
                      className={cn(
                        'inline-flex min-h-9 items-center rounded-lg border px-3 py-1.5 text-xs font-semibold',
                        isSel ? 'border-[rgb(var(--color-brand))] bg-[rgb(var(--color-brand))] text-white' : 'border-[rgb(var(--color-brand))] text-[rgb(var(--color-brand))] hover:bg-[rgb(var(--color-brand))]/10',
                      )}
                    >
                      Yönet
                    </button>
                    <RowMenu v={v} onOpen={onOpen} />
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AccountCard({ v, selected, onOpen }: { v: View; selected: boolean; onOpen: (id: string, tab?: DetailTab, opener?: HTMLElement | null) => void }) {
  const a = v.account
  const sc = scopeSummary(a, provinceName, categoryNames)
  return (
    <li className={cn('rounded-2xl border bg-[rgb(var(--color-card))] p-3', selected ? 'border-[rgb(var(--color-brand))]' : 'border-[rgb(var(--color-border))]')}>
      <div className="flex items-start gap-3">
        <AccountAvatar name={a.displayName} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[rgb(var(--color-text))]" title={a.displayName}>
            {a.displayName}
          </p>
          <p className="truncate text-xs text-[rgb(var(--color-muted))]">{a.username ? `@${a.username}` : '—'}</p>
        </div>
        <RowMenu v={v} onOpen={onOpen} />
      </div>
      <p className="mt-2 flex min-w-0 items-center gap-2 text-sm text-[rgb(var(--color-text))]">
        <PlatformLabel platform={a.platform} />
        <span aria-hidden className="text-[rgb(var(--color-muted))]">·</span>
        <span className="min-w-0 truncate" title={sc.full}>
          {sc.short}
        </span>
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <StatePill state={v.state} />
        <AutomationPill count={v.enabledRules} />
      </div>
      <div className="mt-3 flex gap-2">
        {showReconnect(v) && <ReconnectButton a={a} />}
        <button
          type="button"
          onClick={(e) => onOpen(a.id, 'general', e.currentTarget)}
          aria-label={`${a.displayName} hesabını yönet`}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border border-[rgb(var(--color-brand))] px-3 text-sm font-semibold text-[rgb(var(--color-brand))]"
        >
          Yönet
        </button>
      </div>
    </li>
  )
}

/** «⋯» menu: shortcuts into the detail tabs (actions themselves live in the panel). */
function RowMenu({ v, onOpen }: { v: View; onOpen: (id: string, tab?: DetailTab, opener?: HTMLElement | null) => void }) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const a = v.account
  const items: Array<{ label: string; tab: DetailTab }> = [
    { label: a.canManage && a.connectionMethod !== 'legacy' ? 'Bağlantıyı kontrol et / duraklat' : 'Genel bilgiler', tab: 'general' },
    { label: 'Yayın kapsamı', tab: 'scope' },
    { label: 'Otomasyon kuralları', tab: 'automation' },
    { label: 'Paylaşım geçmişi', tab: 'history' },
  ]

  useEffect(() => {
    if (!open) return
    const first = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')
    first?.focus()
    const onDoc = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const onMenuKey = (e: React.KeyboardEvent) => {
    const els = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const i = els.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      btnRef.current?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      els[(i + 1) % els.length]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      els[(i - 1 + els.length) % els.length]?.focus()
    } else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${a.displayName} için diğer işlemler`}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))] hover:text-[rgb(var(--color-text))]"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden />
      </button>
      {open && (
        <div ref={menuRef} role="menu" aria-label={`${a.displayName} işlemleri`} onKeyDown={onMenuKey} className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] py-1 text-left text-sm shadow-lg">
          {items.map((it) => (
            <button
              key={it.tab}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                setOpen(false)
                onOpen(a.id, it.tab, btnRef.current)
              }}
              className="block w-full px-3 py-2 text-left hover:bg-[rgb(var(--color-surface))] focus:bg-[rgb(var(--color-surface))] focus:outline-none"
            >
              {it.label}
            </button>
          ))}
          <Link role="menuitem" tabIndex={-1} href={`/admin/social/automation?account=${encodeURIComponent(a.id)}`} className="block border-t border-[rgb(var(--color-border))] px-3 py-2 hover:bg-[rgb(var(--color-surface))] focus:bg-[rgb(var(--color-surface))] focus:outline-none">
            Otomasyon sayfasında aç
          </Link>
        </div>
      )}
    </div>
  )
}

function Pager({ page, pages, from, to, total, pageSize, onPage, onPageSize }: { page: number; pages: number; from: number; to: number; total: number; pageSize: number; onPage: (p: number) => void; onPageSize: (n: number) => void }) {
  return (
    <nav aria-label="Sayfalama" className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-[rgb(var(--color-muted))]">
        {from}–{to} / {total} hesap
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-[rgb(var(--color-muted))]">
          <span className="text-xs">Sayfa başına</span>
          <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className={cn(selectCls, 'h-9 sm:h-9')}>
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {pages > 1 && (
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Önceki sayfa" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] disabled:opacity-40">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </button>
            {pageList(page, pages).map((p, i) =>
              p === 'gap' ? (
                <span key={`g${i}`} aria-hidden className="px-1 text-[rgb(var(--color-muted))]">
                  …
                </span>
              ) : (
                <button
                  key={p}
                  type="button"
                  onClick={() => onPage(p)}
                  aria-current={p === page ? 'page' : undefined}
                  aria-label={`Sayfa ${p}`}
                  className={cn('inline-flex h-9 min-w-9 items-center justify-center rounded-lg border px-2 font-semibold', p === page ? 'border-[rgb(var(--color-brand))] bg-[rgb(var(--color-brand))] text-white' : 'border-[rgb(var(--color-border))]')}
                >
                  {p}
                </button>
              ),
            )}
            <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pages} aria-label="Sonraki sayfa" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-[rgb(var(--color-border))] disabled:opacity-40">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 rounded-xl border border-[rgb(var(--color-border))] p-3">
          <span className="h-9 w-9 rounded-full bg-[rgb(var(--color-surface))]" />
          <span className="h-3 w-40 rounded bg-[rgb(var(--color-surface))]" />
          <span className="ml-auto h-3 w-20 rounded bg-[rgb(var(--color-surface))]" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[rgb(var(--color-border))] px-6 py-12 text-center">
      <p className="font-semibold text-[rgb(var(--color-text))]">{title}</p>
      <p className="max-w-md text-sm text-[rgb(var(--color-muted))]">{text}</p>
      {action}
    </div>
  )
}

/** Overlay drawer with a simple focus trap; full screen below `sm`. */
function Drawer({ children, onBackdrop }: { children: React.ReactNode; onBackdrop: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return
    const f = [...ref.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea,summary,[tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null)
    if (f.length === 0) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" aria-hidden onClick={onBackdrop} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label="Hesap ayrıntıları" onKeyDown={onKeyDown} className="relative flex h-[100dvh] w-full flex-col bg-[rgb(var(--color-card))] shadow-2xl sm:max-w-[30rem] sm:border-l sm:border-[rgb(var(--color-border))]">
        {children}
      </div>
    </div>
  )
}
