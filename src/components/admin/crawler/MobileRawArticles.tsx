'use client'

/**
 * MOBILE-ADMIN-2 — Ham Haberler on a phone (< 1024 px).
 * Same data and actions as the desktop table, shown as a card list: queue tabs, one row of
 * quick filters (Kategori / Şehir / Kaynak open a bottom sheet with counts), one main
 * button per card («AI ile yaz»), long-press or «Seç» for bulk actions in a bottom bar.
 * Plain Turkish only — no system codes.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ImageOff, MoreHorizontal, Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EDITORIAL_STATUS_LABELS, crawlerStatusLabel } from '@/services/crawler/editorial/labels'
import { clusterCategoryLabel } from '@/services/crawler/editorial/eventDesk'
import { numberedPages } from '@/services/crawler/editorial/query'
import { isRawArticleAiPublishEligible } from '@/services/crawler/editorial/aiPublishEligibility'
import type { CrawlerEditorialStatus } from '@/services/crawler/types'

export type MobileRawRow = {
  id: string
  sourceId: string
  sourceName: string
  title: string | null
  city: string | null
  publishedAt: string | Date | null
  fetchedAt: string | Date | null
  wordCount: number | null
  mainImageUrl: string | null
  isExactDuplicate: boolean
  qualityStatus: string
  editorialStatus: string
  editorialNewsId: string | null
  canonicalUrl: string | null
  originalUrl: string
  clusterId: string | null
  clusterArticleCount?: number | null
  clusterUniqueSourceCount?: number | null
  clusterCategoryHint?: string | null
  clusterRealAgenda?: boolean
  reviewMeta?: { needsReview?: boolean } | null
}

export type MobileRawQueue = { id: string; label: string; count: number | undefined }

type Sheet = null | 'category' | 'city' | 'source' | { row: MobileRawRow }

export interface MobileRawArticlesProps {
  rows: MobileRawRow[]
  loading: boolean
  total: number
  page: number
  totalPages: number
  queue: string
  queues: MobileRawQueue[]
  params: { search: string; category: string; city: string; source: string; hasImage: string; when: string }
  categories: Array<{ category: string | null; articleCount: number }>
  cities: Array<{ city: string | null; articleCount: number }>
  sources: Array<{ sourceId: string; sourceName: string; articleCount: number }>
  aiDispatchOff: boolean
  aiDisabled: boolean
  aiHint: string
  busyId: string | null
  busyBulk: boolean
  selectedIds: string[]
  selectedCount: number
  onToggleSelect: (id: string) => void
  onSelectPage: () => void
  onClearSelection: () => void
  setParam: (patch: Record<string, string | null>, resetPage?: boolean) => void
  onClearFilters: () => void
  onPage: (p: number) => void
  onOpen: (row: MobileRawRow) => void
  onAiWrite: (id?: string) => void
  onEdit: (id: string) => void
  onRowOp: (op: 'review' | 'ai_candidate' | 'archive', id: string) => void
  onReject: (id?: string) => void
  onBulk: (op: 'review' | 'ai_candidate' | 'archive') => void
  onDelete: () => void
}

function relTime(v: string | Date | null): string {
  if (!v) return ''
  const t = new Date(v).getTime()
  if (!Number.isFinite(t)) return ''
  const m = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (m < 1) return 'şimdi'
  if (m < 60) return `${m} dk`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} sa`
  return `${Math.round(h / 24)} gün`
}

function qualityBadge(row: MobileRawRow): { label: string; tone: string } {
  const l = crawlerStatusLabel(row)
  if (/iyi/i.test(l)) return { label: 'Metin iyi', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' }
  if (/kısmi/i.test(l)) return { label: 'Metin eksik', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' }
  if (/kısa/i.test(l)) return { label: 'Metin çok kısa', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' }
  if (/mükerrer/i.test(l)) return { label: 'Tekrar haber', tone: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
  if (/başarısız|hata/i.test(l)) return { label: 'Metin alınamadı', tone: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }
  return { label: l, tone: 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300' }
}

const chip = (on: boolean) =>
  cn(
    'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-semibold transition',
    on
      ? 'border-[rgb(var(--color-brand))] bg-[rgb(var(--color-brand)/0.1)] text-[rgb(var(--color-brand))]'
      : 'border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-text))]'
  )

function BottomSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] lg:hidden" role="dialog" aria-label={title}>
      <button type="button" aria-label="Kapat" className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[80dvh] overflow-y-auto rounded-t-3xl bg-[rgb(var(--color-card))] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-3 shadow-2xl">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-[rgb(var(--color-border))]" />
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-extrabold">{title}</h3>
          <button type="button" onClick={onClose} className="rounded-full p-1.5" aria-label="Kapat">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function OptionList({
  items,
  active,
  onPick,
  searchable,
}: {
  items: Array<{ value: string; label: string; count: number }>
  active: string
  onPick: (value: string | null) => void
  searchable?: boolean
}) {
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const needle = q.trim().toLocaleLowerCase('tr-TR')
    return needle ? items.filter((i) => i.label.toLocaleLowerCase('tr-TR').includes(needle)) : items
  }, [items, q])
  return (
    <div className="flex flex-col gap-2">
      {searchable ? (
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ara…"
          className="w-full rounded-xl border border-[rgb(var(--color-border))] bg-transparent px-3 py-2 text-base"
        />
      ) : null}
      <button type="button" className={cn(chip(!active), 'justify-between')} onClick={() => onPick(null)}>
        Hepsi
      </button>
      <div className="flex flex-wrap gap-2">
        {list.map((i) => (
          <button key={i.value} type="button" className={chip(active === i.value)} onClick={() => onPick(i.value)}>
            {i.label}
            <span className="text-xs font-medium text-[rgb(var(--color-muted))]">{i.count.toLocaleString('tr-TR')}</span>
          </button>
        ))}
        {!list.length ? <p className="text-sm text-[rgb(var(--color-muted))]">Sonuç yok.</p> : null}
      </div>
    </div>
  )
}

export function MobileRawArticles(p: MobileRawArticlesProps) {
  const [sheet, setSheet] = useState<Sheet>(null)
  const [selecting, setSelecting] = useState(false)
  const pressTimer = useRef<number | null>(null)
  const selectMode = selecting || p.selectedCount > 0

  const categoryItems = p.categories.map((c) => ({
    value: c.category ?? 'none',
    label: c.category ? clusterCategoryLabel(c.category) || c.category : 'Kategorisiz',
    count: c.articleCount,
  }))
  const cityItems = p.cities
    .filter((c) => c.city)
    .map((c) => ({ value: c.city as string, label: c.city as string, count: c.articleCount }))
  const sourceItems = p.sources.map((s) => ({ value: s.sourceId, label: s.sourceName, count: s.articleCount }))
  const catLabel = p.params.category
    ? p.params.category === 'none'
      ? 'Kategorisiz'
      : clusterCategoryLabel(p.params.category) || p.params.category
    : ''
  const srcLabel = p.params.source ? p.sources.find((s) => s.sourceId === p.params.source)?.sourceName || 'Seçili' : ''
  const anyFilter = Boolean(
    p.params.search || p.params.category || p.params.city || p.params.source || p.params.hasImage || p.params.when
  )

  function setWhen(when: 'today' | 'hour' | null) {
    if (!when || p.params.when === when) return p.setParam({ when: null, dateFrom: null }, true)
    const d = new Date()
    if (when === 'today') d.setHours(0, 0, 0, 0)
    else d.setTime(Date.now() - 3600_000)
    p.setParam({ when, dateFrom: d.toISOString() }, true)
  }

  function startPress(id: string) {
    if (pressTimer.current) window.clearTimeout(pressTimer.current)
    pressTimer.current = window.setTimeout(() => {
      setSelecting(true)
      if (!p.selectedIds.includes(id)) p.onToggleSelect(id)
      pressTimer.current = null
    }, 450)
  }
  function cancelPress() {
    if (pressTimer.current) window.clearTimeout(pressTimer.current)
    pressTimer.current = null
  }
  function exitSelect() {
    setSelecting(false)
    p.onClearSelection()
  }

  const canAi = (row: MobileRawRow) =>
    (p.queue === 'active' || p.queue === 'ai_queue') &&
    isRawArticleAiPublishEligible(row.editorialStatus as CrawlerEditorialStatus)

  return (
    <div className="flex flex-col gap-3 pb-32 lg:hidden" data-testid="raw-articles-mobile">
      {p.aiDispatchOff ? (
        <p className="rounded-xl bg-[rgb(var(--color-surface))] px-3 py-2 text-[13px] text-[rgb(var(--color-muted))]">
          Otomatik AI yazımı kapalı: haberler siz <b>AI ile yaz</b> deyince yazılır ve Onay bekleyenler’e düşer.
        </p>
      ) : null}

      {/* queue tabs */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [&::-webkit-scrollbar]:hidden">
        {p.queues.map((q) => (
          <button
            key={q.id}
            type="button"
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-2 text-[13px] font-bold',
              p.queue === q.id
                ? 'bg-[rgb(var(--color-text))] text-[rgb(var(--color-surface))]'
                : 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-text))]'
            )}
            onClick={() => p.setParam({ queue: q.id === 'active' ? null : q.id }, true)}
          >
            {q.label}
            {q.count != null ? <span className="opacity-70">{q.count.toLocaleString('tr-TR')}</span> : null}
          </button>
        ))}
      </div>

      {/* search */}
      <form
        className="flex items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3"
        onSubmit={(e) => {
          e.preventDefault()
          const v = String(new FormData(e.currentTarget).get('search') || '').trim()
          p.setParam({ search: v || null }, true)
        }}
      >
        <Search className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" aria-hidden />
        <input
          key={p.params.search}
          name="search"
          defaultValue={p.params.search}
          placeholder="Başlıkta ara"
          enterKeyHint="search"
          className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none"
        />
      </form>

      {/* quick filters */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [&::-webkit-scrollbar]:hidden">
        <button type="button" className={chip(Boolean(p.params.category))} onClick={() => setSheet('category')}>
          {catLabel ? `Kategori: ${catLabel}` : 'Kategori'} <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" className={chip(Boolean(p.params.city))} onClick={() => setSheet('city')}>
          {p.params.city ? `Şehir: ${p.params.city}` : 'Şehir'} <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button type="button" className={chip(Boolean(p.params.source))} onClick={() => setSheet('source')}>
          {srcLabel ? `Kaynak: ${srcLabel}` : 'Kaynak'} <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
        <button
          type="button"
          className={chip(p.params.hasImage === 'with')}
          onClick={() => p.setParam({ hasImage: p.params.hasImage === 'with' ? null : 'with' }, true)}
        >
          Görselli
        </button>
        <button type="button" className={chip(p.params.when === 'today')} onClick={() => setWhen('today')}>
          Bugün
        </button>
        <button type="button" className={chip(p.params.when === 'hour')} onClick={() => setWhen('hour')}>
          Son 1 saat
        </button>
        {anyFilter ? (
          <button type="button" className={cn(chip(false), 'text-[rgb(var(--color-brand))]')} onClick={p.onClearFilters}>
            Temizle
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-between text-[13px] text-[rgb(var(--color-muted))]">
        <span>{p.loading ? 'Yükleniyor…' : `${p.total.toLocaleString('tr-TR')} haber`}</span>
        {selectMode ? (
          <span className="flex gap-3">
            <button type="button" className="font-semibold" onClick={p.onSelectPage}>
              Sayfadakileri seç
            </button>
            <button type="button" className="font-semibold text-[rgb(var(--color-brand))]" onClick={exitSelect}>
              Vazgeç
            </button>
          </span>
        ) : (
          <button type="button" className="font-semibold" onClick={() => setSelecting(true)}>
            Seç
          </button>
        )}
      </div>

      {/* list */}
      <div className="flex flex-col gap-2.5">
        {p.loading && !p.rows.length
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex animate-pulse gap-3 rounded-2xl border border-[rgb(var(--color-border))] p-3">
                <div className="h-16 w-20 rounded-xl bg-[rgb(var(--color-surface))]" />
                <div className="flex flex-1 flex-col gap-2">
                  <div className="h-3.5 w-11/12 rounded bg-[rgb(var(--color-surface))]" />
                  <div className="h-3.5 w-8/12 rounded bg-[rgb(var(--color-surface))]" />
                  <div className="h-3 w-5/12 rounded bg-[rgb(var(--color-surface))]" />
                </div>
              </div>
            ))
          : null}
        {!p.loading && !p.rows.length ? (
          <p className="rounded-2xl border border-dashed border-[rgb(var(--color-border))] px-4 py-8 text-center text-sm text-[rgb(var(--color-muted))]">
            Bu filtrede haber yok.
          </p>
        ) : null}
        {p.rows.map((row) => {
          const q = qualityBadge(row)
          const selected = p.selectedIds.includes(row.id)
          const same = (row.clusterUniqueSourceCount || 0) >= 2
          const cat = clusterCategoryLabel(row.clusterCategoryHint)
          const status = row.editorialStatus !== 'NEW' ? EDITORIAL_STATUS_LABELS[row.editorialStatus as keyof typeof EDITORIAL_STATUS_LABELS] : null
          return (
            <article
              key={row.id}
              className={cn(
                'flex gap-3 rounded-2xl border bg-[rgb(var(--color-card))] p-3 transition',
                selected ? 'border-[rgb(var(--color-brand))] ring-1 ring-[rgb(var(--color-brand))]' : 'border-[rgb(var(--color-border))]'
              )}
              onPointerDown={() => startPress(row.id)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onPointerCancel={cancelPress}
              onContextMenu={(e) => e.preventDefault()}
            >
              {selectMode ? (
                <input
                  type="checkbox"
                  aria-label="Seç"
                  checked={selected}
                  onChange={() => p.onToggleSelect(row.id)}
                  className="mt-1 h-5 w-5 shrink-0 accent-[rgb(var(--color-brand))]"
                />
              ) : null}
              <button
                type="button"
                className="shrink-0"
                onClick={() => (selectMode ? p.onToggleSelect(row.id) : p.onOpen(row))}
                aria-label="Haberi görüntüle"
              >
                {row.mainImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.mainImageUrl} alt="" loading="lazy" className="h-16 w-20 rounded-xl object-cover" />
                ) : (
                  <span className="flex h-16 w-20 items-center justify-center rounded-xl bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]">
                    <ImageOff className="h-5 w-5" aria-hidden />
                  </span>
                )}
              </button>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <button
                  type="button"
                  className="text-left text-[15px] font-bold leading-snug"
                  onClick={() => (selectMode ? p.onToggleSelect(row.id) : p.onOpen(row))}
                >
                  {row.title || '(başlıksız)'}
                </button>
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  {[row.sourceName, row.city, relTime(row.publishedAt || row.fetchedAt)].filter(Boolean).join(' · ')}
                </p>
                <div className="flex flex-wrap gap-1">
                  <span className={cn('rounded-md px-1.5 py-0.5 text-[11px] font-bold', q.tone)}>{q.label}</span>
                  {same ? (
                    <a
                      href={row.clusterId ? `/admin/crawler/clusters/${row.clusterId}` : undefined}
                      className="rounded-md bg-red-100 px-1.5 py-0.5 text-[11px] font-bold text-red-700 dark:bg-red-900/40 dark:text-red-300"
                    >
                      {row.clusterUniqueSourceCount} kaynakta aynı olay
                    </a>
                  ) : null}
                  {cat ? (
                    <span className="rounded-md bg-slate-200 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{cat}</span>
                  ) : null}
                  {status ? (
                    <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[11px] font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">{status}</span>
                  ) : null}
                </div>
                {!selectMode ? (
                  <div className="mt-0.5 flex items-center gap-2">
                    {row.editorialStatus === 'PUBLISHED' && row.editorialNewsId ? (
                      <a href={`/admin/news/${row.editorialNewsId}/edit`} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[13px] font-bold text-white">
                        Yayında · Aç
                      </a>
                    ) : canAi(row) ? (
                      <button
                        type="button"
                        disabled={p.aiDisabled || p.busyBulk}
                        title={p.aiHint}
                        onClick={() => p.onAiWrite(row.id)}
                        className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
                      >
                        AI ile yaz
                      </button>
                    ) : null}
                    {row.editorialStatus !== 'PUBLISHED' ? (
                      <button
                        type="button"
                        disabled={p.busyId === row.id}
                        onClick={() => p.onEdit(row.id)}
                        className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1.5 text-[13px] font-bold"
                      >
                        {p.busyId === row.id ? 'Açılıyor…' : 'Kendim yazayım'}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Diğer işlemler"
                      className="ml-auto rounded-lg p-1.5"
                      onClick={() => setSheet({ row })}
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </div>
                ) : null}
              </div>
            </article>
          )
        })}
      </div>

      {/* pages */}
      {p.totalPages > 1 ? (
        <div className="flex flex-wrap items-center justify-center gap-1 text-sm">
          <button type="button" disabled={p.page <= 1} className="rounded-lg px-3 py-2 disabled:opacity-40" onClick={() => p.onPage(p.page - 1)}>
            Önceki
          </button>
          {numberedPages(p.page, p.totalPages).map((it, i) =>
            it === 'ellipsis' ? (
              <span key={`e${i}`} className="px-1">…</span>
            ) : (
              <button
                key={it}
                type="button"
                onClick={() => p.onPage(it)}
                className={cn('min-w-9 rounded-lg px-2 py-2', it === p.page && 'bg-[rgb(var(--color-brand))] text-white')}
              >
                {it}
              </button>
            )
          )}
          <button type="button" disabled={p.page >= p.totalPages} className="rounded-lg px-3 py-2 disabled:opacity-40" onClick={() => p.onPage(p.page + 1)}>
            Sonraki
          </button>
        </div>
      ) : null}

      {/* bulk bar */}
      {selectMode ? (
        <div className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[60] flex items-center gap-2 overflow-x-auto rounded-2xl bg-[rgb(var(--color-text))] p-2 text-[13px] font-bold text-[rgb(var(--color-surface))] shadow-2xl lg:hidden">
          <span className="shrink-0 px-1">{p.selectedCount} seçili</span>
          {p.queue === 'active' ? (
            <button
              type="button"
              disabled={!p.selectedCount || p.aiDisabled || p.busyBulk}
              className="shrink-0 rounded-xl bg-[rgb(var(--color-brand))] px-3 py-2 text-white disabled:opacity-50"
              onClick={() => p.onAiWrite()}
            >
              AI ile yaz
            </button>
          ) : null}
          <button type="button" disabled={!p.selectedCount || p.busyBulk} className="shrink-0 rounded-xl bg-white/15 px-3 py-2 disabled:opacity-50" onClick={() => p.onBulk('review')}>
            İncele
          </button>
          <button type="button" disabled={!p.selectedCount || p.busyBulk} className="shrink-0 rounded-xl bg-white/15 px-3 py-2 disabled:opacity-50" onClick={() => p.onReject()}>
            Reddet
          </button>
          <button type="button" disabled={!p.selectedCount || p.busyBulk} className="shrink-0 rounded-xl bg-white/15 px-3 py-2 disabled:opacity-50" onClick={() => p.onBulk('archive')}>
            Arşivle
          </button>
          <button type="button" disabled={!p.selectedCount || p.busyBulk} className="shrink-0 rounded-xl bg-red-600 px-3 py-2 text-white disabled:opacity-50" onClick={p.onDelete}>
            Sil
          </button>
        </div>
      ) : null}

      {/* sheets */}
      {sheet === 'category' ? (
        <BottomSheet title="Kategori" onClose={() => setSheet(null)}>
          <OptionList
            items={categoryItems}
            active={p.params.category}
            onPick={(v) => {
              p.setParam({ category: v }, true)
              setSheet(null)
            }}
          />
        </BottomSheet>
      ) : null}
      {sheet === 'city' ? (
        <BottomSheet title="Şehir" onClose={() => setSheet(null)}>
          <OptionList
            searchable
            items={cityItems}
            active={p.params.city}
            onPick={(v) => {
              p.setParam({ city: v }, true)
              setSheet(null)
            }}
          />
        </BottomSheet>
      ) : null}
      {sheet === 'source' ? (
        <BottomSheet title="Kaynak" onClose={() => setSheet(null)}>
          <OptionList
            searchable
            items={sourceItems}
            active={p.params.source}
            onPick={(v) => {
              p.setParam({ source: v }, true)
              setSheet(null)
            }}
          />
        </BottomSheet>
      ) : null}
      {sheet && typeof sheet === 'object' ? (
        <BottomSheet title={sheet.row.title || 'Haber'} onClose={() => setSheet(null)}>
          <div className="flex flex-col divide-y divide-[rgb(var(--color-border))] text-[15px]">
            {[
              { label: 'Haberi görüntüle', run: () => p.onOpen(sheet.row) },
              ...(canAi(sheet.row) ? [{ label: 'AI ile yaz', run: () => p.onAiWrite(sheet.row.id) }] : []),
              ...(sheet.row.editorialStatus !== 'PUBLISHED' ? [{ label: 'Kendim yazayım (editörde aç)', run: () => p.onEdit(sheet.row.id) }] : []),
              { label: 'İncelemeye al', run: () => p.onRowOp('review', sheet.row.id) },
              { label: 'AI için işaretle (yazdırmaz)', run: () => p.onRowOp('ai_candidate', sheet.row.id) },
              ...(sheet.row.clusterId ? [{ label: 'Aynı olay haberleri', href: `/admin/crawler/clusters/${sheet.row.clusterId}` }] : []),
              { label: 'Kaynak sitede aç', href: sheet.row.canonicalUrl || sheet.row.originalUrl, external: true },
              { label: 'Arşivle', run: () => p.onRowOp('archive', sheet.row.id) },
              { label: 'Reddet', run: () => p.onReject(sheet.row.id), danger: true },
            ].map((a) =>
              'href' in a && a.href ? (
                <a
                  key={a.label}
                  href={a.href}
                  target={'external' in a && a.external ? '_blank' : undefined}
                  rel="noreferrer"
                  className="flex items-center justify-between py-3"
                >
                  {a.label}
                  <ChevronRight className="h-4 w-4 text-[rgb(var(--color-muted))]" aria-hidden />
                </a>
              ) : (
                <button
                  key={a.label}
                  type="button"
                  className={cn('flex items-center justify-between py-3 text-left', 'danger' in a && a.danger && 'text-red-600')}
                  onClick={() => {
                    setSheet(null)
                    ;(a as { run: () => void }).run()
                  }}
                >
                  {a.label}
                  <ChevronRight className="h-4 w-4 text-[rgb(var(--color-muted))]" aria-hidden />
                </button>
              )
            )}
          </div>
        </BottomSheet>
      ) : null}
    </div>
  )
}
