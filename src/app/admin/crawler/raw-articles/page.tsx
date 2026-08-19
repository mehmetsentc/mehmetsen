'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { BulkToolbar } from '@/components/admin/crawler/BulkToolbar'
import { CrawlerConfirmModal } from '@/components/admin/crawler/CrawlerConfirmModal'
import { RejectReasonModal } from '@/components/admin/crawler/RejectReasonModal'
import { RowOverflowMenu } from '@/components/admin/crawler/RowOverflowMenu'
import { notifyCrawlerBulk } from '@/components/admin/crawler/notifyBulk'
import { auth } from '@/lib/firebase/auth'
import { EDITORIAL_STATUS_LABELS, crawlerStatusLabel } from '@/services/crawler/editorial/labels'
import { numberedPages, nextSortState, RAW_ARTICLE_PAGE_SIZES } from '@/services/crawler/editorial/query'
import { RawArticleDrawer } from '@/components/admin/crawler/RawArticleDrawer'
import {
  clearSelection,
  pageSelectionHint,
  reconcileSelection,
  selectAllMatching,
  selectCurrentPage,
  selectedCount,
  selectionFilterKey,
  toggleRow,
  type BulkSelectionState,
} from '@/services/crawler/editorial/selection'
import type { BulkResult } from '@/services/crawler/editorial/bulk'
import type { CrawlerEditorialStatus, CrawlerRejectionReason } from '@/services/crawler/types'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function fmt(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('tr-TR')
}

interface ArticleRow {
  id: string
  sourceId: string
  sourceName: string
  title: string | null
  countryCode: string | null
  city: string | null
  publishedAt: string | Date | null
  fetchedAt: string | Date | null
  wordCount: number | null
  extractionConfidence: number | null
  canonicalUrl: string | null
  originalUrl: string
  mainImageUrl: string | null
  isExactDuplicate: boolean
  qualityStatus: string
  editorialStatus: CrawlerEditorialStatus
  editorialNewsId: string | null
  clusterId: string | null
  articleBodyText?: string | null
  description?: string | null
  imageCandidateCount?: number | null
  imageRejectedCount?: number | null
}

interface ListResponse {
  articles?: ArticleRow[]
  groups?: Array<{
    sourceId: string
    sourceName: string
    articleCount: number
    articles: ArticleRow[]
  }>
  total?: number
  page?: number
  pageSize?: number
  totalPages?: number
  summary?: {
    total: number
    sourceCount: number
    lastHour: number
    withImage: number
    withoutImage: number
    duplicates: number
  }
  sources?: Array<{ sourceId: string; sourceName: string; articleCount: number }>
  queueCounts?: { active: number; published: number; rejected: number; archived: number }
  error?: string
}

function qsFrom(params: URLSearchParams): string {
  const q = new URLSearchParams()
  params.forEach((v, k) => {
    if (v) q.set(k, v)
  })
  return q.toString()
}

function Pager({
  page,
  totalPages,
  onPage,
}: {
  page: number
  totalPages: number
  onPage: (p: number) => void
}) {
  const items = numberedPages(page, totalPages)
  return (
    <div className="flex flex-wrap items-center gap-1 text-sm">
      <button type="button" disabled={page <= 1} className="rounded-lg px-2 py-1 disabled:opacity-40" onClick={() => onPage(page - 1)}>
        Önceki
      </button>
      {items.map((item, i) =>
        item === 'ellipsis' ? (
          <span key={`e-${i}`} className="px-1">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPage(item)}
            className={`rounded-lg px-2 py-1 ${item === page ? 'bg-[rgb(var(--color-brand))] text-white' : ''}`}
          >
            {item}
          </button>
        )
      )}
      <button
        type="button"
        disabled={page >= totalPages}
        className="rounded-lg px-2 py-1 disabled:opacity-40"
        onClick={() => onPage(page + 1)}
      >
        Sonraki
      </button>
    </div>
  )
}

export default function CrawlerArticlesPage() {
  return (
    <Suspense fallback={<AdminOsPageShell title="Ham Haberler" subtitle="Yükleniyor…"><p>Yükleniyor…</p></AdminOsPageShell>}>
      <CrawlerArticlesInner />
    </Suspense>
  )
}

function CrawlerArticlesInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [data, setData] = useState<ListResponse | null>(null)
  const [detail, setDetail] = useState<ArticleRow | null>(null)
  const [detailMedia, setDetailMedia] = useState<
    Array<{
      sourceUrl: string
      status: string
      isPrimary?: boolean
      discoveryMethod?: string
      imageSource?: string | null
      imageConfidence?: number | null
      altText?: string | null
    }>
  >([])
  const [mediaSummary, setMediaSummary] = useState<{
    mediaCount: number
    primaryUrl: string | null
    duplicateCount: number
    rejectedCount: number
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [busyBulk, setBusyBulk] = useState(false)
  const [selection, setSelection] = useState<BulkSelectionState>(clearSelection(''))
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [confirmMatch, setConfirmMatch] = useState(false)

  const queryString = useMemo(() => {
    const p = new URLSearchParams(searchParams.toString())
    if (!p.get('page')) p.set('page', '1')
    if (!p.get('pageSize')) p.set('pageSize', '25')
    return qsFrom(p)
  }, [searchParams])

  const setParam = useCallback(
    (patch: Record<string, string | null>, resetPage = false) => {
      const p = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (!v) p.delete(k)
        else p.set(k, v)
      }
      if (resetPage) p.set('page', '1')
      router.replace(`/admin/crawler/raw-articles?${qsFrom(p)}`)
    },
    [router, searchParams]
  )

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch(`/api/admin/crawler/articles?${queryString}`, { headers: await authHeaders() })
      const body = (await res.json()) as ListResponse
      if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
    }
  }, [queryString])

  useEffect(() => {
    void load()
  }, [load])

  const filterKey = useMemo(
    () =>
      selectionFilterKey({
        search: searchParams.get('search'),
        source: searchParams.get('source'),
        country: searchParams.get('country'),
        city: searchParams.get('city'),
        status: searchParams.get('status'),
        qualityStatus: searchParams.get('qualityStatus'),
        hasImage: searchParams.get('hasImage'),
        editorialStatus: searchParams.get('editorialStatus'),
        dateFrom: searchParams.get('dateFrom'),
        dateTo: searchParams.get('dateTo'),
        view: searchParams.get('view'),
        queue: searchParams.get('queue'),
        sort: searchParams.get('sort'),
        order: searchParams.get('order'),
      }),
    [searchParams]
  )

  useEffect(() => {
    setSelection((prev) => reconcileSelection(prev, filterKey))
  }, [filterKey])

  useEffect(() => {
    if (!detail) {
      setMediaSummary(null)
      return
    }
    void (async () => {
      const res = await fetch(`/api/admin/crawler/articles?id=${encodeURIComponent(detail.id)}`, {
        headers: await authHeaders(),
      })
      const body = await res.json()
      if (body.article) setDetail({ ...detail, ...body.article })
      if (body.mediaSummary) setMediaSummary(body.mediaSummary)
      if (Array.isArray(body.media)) setDetailMedia(body.media)
    })()
  }, [detail])

  function activeFilter() {
    return {
      search: searchParams.get('search'),
      source: searchParams.get('source'),
      country: searchParams.get('country'),
      city: searchParams.get('city'),
      status: searchParams.get('status'),
      qualityStatus: searchParams.get('qualityStatus'),
      hasImage: searchParams.get('hasImage'),
      editorialStatus: searchParams.get('editorialStatus'),
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
      sort: searchParams.get('sort') || 'newest',
      order: searchParams.get('order'),
      queue: searchParams.get('queue') || 'active',
    }
  }

  async function runBulk(
    op: string,
    extra?: { reason?: CrawlerRejectionReason; note?: string; ids?: string[] }
  ) {
    if (busyBulk) return
    setBusyBulk(true)
    try {
      const explicit = extra?.ids
      const res = await fetch('/api/admin/crawler/articles/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          op,
          matchFilter: !explicit && selection.mode === 'matching',
          ids: explicit || (selection.mode === 'matching' ? [] : selection.ids),
          filter: activeFilter(),
          reason: extra?.reason,
          note: extra?.note,
        }),
      })
      const body = (await res.json()) as BulkResult & { error?: string }
      if (!res.ok) throw new Error(body.error || 'İşlem başarısız')
      const labels: Record<string, string> = {
        review: `${body.affected} haber incelemeye alındı.`,
        ai_candidate: `${body.affected} haber AI adayı olarak işaretlendi.`,
        reject: `${body.affected} haber reddedildi.`,
        archive: `${body.affected} haber arşivlendi.`,
        delete: `${body.affected} haber silindi (${body.tombstoned} tombstone, ${body.hardDeleted} kalıcı).`,
      }
      notifyCrawlerBulk(body, labels[op] || 'İşlem tamam')
      setSelection(clearSelection(filterKey))
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setBusyBulk(false)
      setConfirmDelete(false)
      setRejectOpen(false)
    }
  }

  async function openManual(id: string) {
    if (busyId) return
    setBusyId(id)
    try {
      const res = await fetch('/api/admin/crawler/editorial/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ rawArticleId: id }),
      })
      const body = (await res.json()) as { error?: string; editPath?: string; publicPath?: string; published?: boolean }
      if (!res.ok) throw new Error(body.error || 'Açılamadı')
      if (body.editPath) router.push(body.editPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Açılamadı')
    } finally {
      setBusyId(null)
    }
  }

  const page = data?.page || Number(searchParams.get('page') || '1')
  const pageSize = data?.pageSize || Number(searchParams.get('pageSize') || '25')
  const total = data?.total || 0
  const totalPages = data?.totalPages || 1
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const view = searchParams.get('view') === 'bySource' ? 'bySource' : 'all'
  const rows = data?.articles || []
  const visibleIds = view === 'bySource' ? (data?.groups || []).flatMap((g) => g.articles.map((a) => a.id)) : rows.map((r) => r.id)
  const count = selectedCount(selection, pageSize)
  const hint = pageSelectionHint(selection, pageSize)
  const queue = searchParams.get('queue') || 'active'
  const sortCol = searchParams.get('sort')
  const sortOrder = searchParams.get('order')

  function cycleSort(column: 'publishedAt' | 'wordCount' | 'extractionConfidence' | 'source' | 'status' | 'editorial') {
    const next = nextSortState(sortCol, sortOrder, column)
    setParam({ sort: next.sort, order: next.order, page: '1' })
  }

  function sortMark(column: string) {
    if (sortCol !== column) return ''
    return sortOrder === 'asc' ? ' ↑' : ' ↓'
  }

  const filterBar = (
    <form
      className="flex flex-wrap gap-2 text-sm"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        setParam(
          {
            search: String(fd.get('search') || '') || null,
            source: String(fd.get('source') || '') || null,
            country: String(fd.get('country') || '') || null,
            city: String(fd.get('city') || '') || null,
            status: String(fd.get('status') || '') || null,
            qualityStatus: String(fd.get('qualityStatus') || '') || null,
            hasImage: String(fd.get('hasImage') || '') || null,
            dateFrom: String(fd.get('dateFrom') || '') || null,
            dateTo: String(fd.get('dateTo') || '') || null,
            editorialStatus: String(fd.get('editorialStatus') || '') || null,
            sort: String(fd.get('sort') || '') || 'newest',
            pageSize: String(fd.get('pageSize') || '25'),
          },
          true
        )
      }}
    >
      <input name="search" defaultValue={searchParams.get('search') || ''} placeholder="Başlıkta ara" className="rounded border px-2 py-1" />
      <select name="source" defaultValue={searchParams.get('source') || ''} className="rounded border px-2 py-1">
        <option value="">Kaynak</option>
        {(data?.sources || []).map((s) => (
          <option key={s.sourceId} value={s.sourceId}>
            {s.sourceName} ({s.articleCount})
          </option>
        ))}
      </select>
      <input name="country" defaultValue={searchParams.get('country') || ''} placeholder="Ülke" className="w-16 rounded border px-2 py-1" />
      <input name="city" defaultValue={searchParams.get('city') || ''} placeholder="Şehir" className="w-28 rounded border px-2 py-1" />
      <select name="status" defaultValue={searchParams.get('status') || ''} className="rounded border px-2 py-1">
        <option value="">Durum</option>
        <option value="extracted">Kayıtlı</option>
        <option value="duplicate">Mükerrer</option>
        <option value="failed">Başarısız</option>
      </select>
      <select name="qualityStatus" defaultValue={searchParams.get('qualityStatus') || ''} className="rounded border px-2 py-1">
        <option value="">Kalite</option>
        <option value="EXTRACTED">Çıkarıldı</option>
        <option value="LOW_CONFIDENCE">Düşük güven</option>
        <option value="FAILED">Başarısız</option>
      </select>
      <select name="hasImage" defaultValue={searchParams.get('hasImage') || ''} className="rounded border px-2 py-1">
        <option value="">Görsel</option>
        <option value="with">Görselli</option>
        <option value="without">Görselsiz</option>
      </select>
      <select name="editorialStatus" defaultValue={searchParams.get('editorialStatus') || ''} className="rounded border px-2 py-1">
        <option value="">Editoryal</option>
        {Object.entries(EDITORIAL_STATUS_LABELS).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <input type="date" name="dateFrom" defaultValue={searchParams.get('dateFrom') || ''} className="rounded border px-2 py-1" />
      <input type="date" name="dateTo" defaultValue={searchParams.get('dateTo') || ''} className="rounded border px-2 py-1" />
      <select name="sort" defaultValue={searchParams.get('sort') || 'newest'} className="rounded border px-2 py-1">
        <option value="newest">En Yeni Haber</option>
        <option value="published">Yayın tarihi</option>
        <option value="oldest">En eski</option>
      </select>
      <select name="pageSize" defaultValue={searchParams.get('pageSize') || '25'} className="rounded border px-2 py-1">
        {RAW_ARTICLE_PAGE_SIZES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      <button type="submit" className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1 text-white">
        Uygula
      </button>
      <button
        type="button"
        className="rounded-lg px-3 py-1 underline"
        onClick={() => router.replace('/admin/crawler/raw-articles')}
      >
        Filtreleri Temizle
      </button>
    </form>
  )

  function renderActions(row: ArticleRow) {
    const published = row.editorialStatus === 'PUBLISHED'
    return (
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" className="underline" onClick={() => void setDetail(row)}>
          Görüntüle
        </button>
        {published ? (
          <>
            <span className="text-emerald-600">Yayında</span>
            {row.editorialNewsId ? (
              <a className="underline" href={`/admin/news/${row.editorialNewsId}/edit`}>
                Haberi Aç
              </a>
            ) : null}
          </>
        ) : (
          <button
            type="button"
            className="underline"
            disabled={busyId === row.id}
            onClick={() => void openManual(row.id)}
          >
            {busyId === row.id ? 'Açılıyor…' : 'Manuel Düzenle'}
          </button>
        )}
        {row.canonicalUrl || row.originalUrl ? (
          <a className="underline" href={row.canonicalUrl || row.originalUrl} target="_blank" rel="noreferrer">
            Kaynağı Aç
          </a>
        ) : null}
        {row.clusterId ? (
          <a className="underline" href={`/admin/crawler/clusters/${row.clusterId}`}>
            Olay Kümesini Gör
          </a>
        ) : null}
        <RowOverflowMenu
          items={[
            { label: 'İncelemeye Al', onClick: () => void runBulk('review', { ids: [row.id] }) },
            { label: 'AI Adayı', onClick: () => void runBulk('ai_candidate', { ids: [row.id] }) },
            {
              label: 'Reddet',
              onClick: () => {
                setSelection({ ids: [row.id], mode: 'none', matchingTotal: total, filterKey })
                setRejectOpen(true)
              },
            },
            { label: 'Arşivle', onClick: () => void runBulk('archive', { ids: [row.id] }) },
          ]}
        />
      </div>
    )
  }

  function renderTable(list: ArticleRow[]) {
    return (
      <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgb(var(--color-surface))] text-[11px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Sayfadaki tümünü seç"
                  checked={visibleIds.length > 0 && visibleIds.every((id) => selection.ids.includes(id) || selection.mode === 'matching')}
                  onChange={() =>
                    setSelection(
                      visibleIds.length && visibleIds.every((id) => selection.ids.includes(id))
                        ? clearSelection(filterKey)
                        : selectCurrentPage(visibleIds, filterKey, total)
                    )
                  }
                />
              </th>
              <th className="px-3 py-2">Görsel</th>
              <th className="px-3 py-2">Başlık</th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => cycleSort('source')}>
                  Kaynak{sortMark('source')}
                </button>
              </th>
              <th className="px-3 py-2">Ülke</th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => cycleSort('publishedAt')}>
                  Tarih{sortMark('publishedAt')}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => cycleSort('wordCount')}>
                  Kelime{sortMark('wordCount')}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => cycleSort('extractionConfidence')}>
                  Güven{sortMark('extractionConfidence')}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => cycleSort('status')}>
                  Durum{sortMark('status')}
                </button>
              </th>
              <th className="px-3 py-2">
                <button type="button" onClick={() => cycleSort('editorial')}>
                  Editoryal{sortMark('editorial')}
                </button>
              </th>
              <th className="px-3 py-2">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.id} className="border-t border-[rgb(var(--color-border))]">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label="Seç"
                    checked={selection.mode === 'matching' || selection.ids.includes(row.id)}
                    onChange={() => setSelection((prev) => toggleRow(prev, row.id, visibleIds))}
                  />
                </td>
                <td className="px-3 py-2">
                  {row.mainImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.mainImageUrl} alt="" className="h-12 w-16 rounded object-cover" />
                  ) : (
                    <span className="text-[rgb(var(--color-muted))]">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <button type="button" className="text-left font-medium underline" onClick={() => setDetail(row)}>
                    {row.title || '(başlıksız)'}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <button type="button" className="underline" onClick={() => setParam({ source: row.sourceId }, true)}>
                    {row.sourceName}
                  </button>
                </td>
                <td className="px-3 py-2">{row.countryCode || '—'}</td>
                <td className="px-3 py-2">
                  {row.publishedAt || row.fetchedAt
                    ? new Date(row.publishedAt || row.fetchedAt || '').toLocaleString('tr-TR')
                    : '—'}
                </td>
                <td className="px-3 py-2">{fmt(row.wordCount ?? undefined)}</td>
                <td className="px-3 py-2">
                  {row.extractionConfidence != null ? `${Math.round(row.extractionConfidence * 100)}%` : '—'}
                </td>
                <td className="px-3 py-2">{crawlerStatusLabel(row)}</td>
                <td className="px-3 py-2">{EDITORIAL_STATUS_LABELS[row.editorialStatus] || row.editorialStatus}</td>
                <td className="px-3 py-2">{renderActions(row)}</td>
              </tr>
            ))}
            {!list.length ? (
              <tr>
                <td className="px-3 py-6 text-[rgb(var(--color-muted))]" colSpan={11}>
                  Kayıt yok.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <AdminOsPageShell title="Ham Haberler" subtitle="Crawler çıkarımı. AI yok. Ham kayıt değiştirilmez.">
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <AdminOsMetricGrid
        items={[
          { label: 'Toplam', value: fmt(data?.summary?.total) },
          { label: 'Kaynak', value: fmt(data?.summary?.sourceCount) },
          { label: 'Son 1 saat', value: fmt(data?.summary?.lastHour) },
          { label: 'Görselli', value: fmt(data?.summary?.withImage) },
          { label: 'Görselsiz', value: fmt(data?.summary?.withoutImage) },
          { label: 'Mükerrer', value: fmt(data?.summary?.duplicates) },
        ]}
      />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {(
          [
            ['active', 'Aktif kuyruk', data?.queueCounts?.active],
            ['published', 'Yayınlananlar', data?.queueCounts?.published],
            ['rejected', 'Reddedilenler', data?.queueCounts?.rejected],
            ['archived', 'Arşivlenenler', data?.queueCounts?.archived],
          ] as const
        ).map(([id, label, n]) => (
          <button
            key={id}
            type="button"
            className={queue === id ? 'font-semibold underline' : ''}
            onClick={() => setParam({ queue: id === 'active' ? null : id }, true)}
          >
            {label} ({fmt(n)})
          </button>
        ))}
      </div>
      <div className="mb-3 flex gap-2 text-sm">
        <button type="button" className={view === 'all' ? 'font-semibold underline' : ''} onClick={() => setParam({ view: null }, true)}>
          Tüm Haberler
        </button>
        <button
          type="button"
          className={view === 'bySource' ? 'font-semibold underline' : ''}
          onClick={() => setParam({ view: 'bySource' }, true)}
        >
          Kaynağa Göre
        </button>
      </div>
      <div className="mb-2 flex flex-wrap gap-2 text-xs">
        {(data?.sources || []).slice(0, 8).map((s) => (
          <button
            key={s.sourceId}
            type="button"
            className="rounded-full bg-[rgb(var(--color-surface))] px-3 py-1"
            onClick={() => setParam({ source: s.sourceId, view: null }, true)}
          >
            {s.sourceName} ({s.articleCount})
          </button>
        ))}
      </div>
      {filterBar}
      <BulkToolbar
        count={count}
        pageHint={hint}
        matchingHint={
          selection.mode === 'page' && total > visibleIds.length ? `Tüm ${total.toLocaleString('tr-TR')} sonucu seç` : null
        }
        onSelectMatching={() => setConfirmMatch(true)}
        onClear={() => setSelection(clearSelection(filterKey))}
      >
        <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" onClick={() => void runBulk('review')}>
          İncelemeye Al
        </button>
        <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" onClick={() => void runBulk('ai_candidate')}>
          AI Adayı
        </button>
        <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" onClick={() => setRejectOpen(true)}>
          Reddet
        </button>
        <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" onClick={() => void runBulk('archive')}>
          Arşivle
        </button>
        <button type="button" className="rounded-lg bg-red-600 px-3 py-1 text-white" onClick={() => setConfirmDelete(true)}>
          Sil
        </button>
      </BulkToolbar>
      <div className="my-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <div>
          {total ? `${start}–${end} / ${total.toLocaleString('tr-TR')} haber` : '0 haber'}
        </div>
        <Pager page={page} totalPages={totalPages} onPage={(p) => setParam({ page: String(p) })} />
      </div>
      {view === 'bySource'
        ? (data?.groups || []).map((g) => (
            <details key={g.sourceId} open className="mb-4">
              <summary className="mb-2 cursor-pointer font-semibold">
                <button type="button" className="underline" onClick={() => setParam({ source: g.sourceId, view: null }, true)}>
                  {g.sourceName}
                </button>{' '}
                <span className="text-[rgb(var(--color-muted))]">({g.articleCount})</span>
              </summary>
              {renderTable(g.articles)}
            </details>
          ))
        : renderTable(rows)}
      <div className="mt-3 flex justify-end">
        <Pager page={page} totalPages={totalPages} onPage={(p) => setParam({ page: String(p) })} />
      </div>
      {detail ? (
        <RawArticleDrawer
          article={detail}
          media={detailMedia}
          busy={busyId === detail.id}
          onClose={() => {
            setDetail(null)
            setDetailMedia([])
          }}
          onManual={() => void openManual(detail.id)}
        />
      ) : null}
      <RejectReasonModal
        open={rejectOpen}
        count={count || 1}
        busy={busyBulk}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason, note) => void runBulk('reject', { reason, note })}
      />
      <CrawlerConfirmModal
        open={confirmDelete}
        title="Ham haberleri sil"
        body={`${count} ham haber silinecek.\nBu işlem crawler kayıtlarını temizleyebilir ve geri alınamayabilir.\nKüme/medya ilişkisi varsa kayıt tombstone olur.\nDevam etmek istiyor musunuz?`}
        confirmLabel="Sil"
        danger
        busy={busyBulk}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => void runBulk('delete')}
      />
      <CrawlerConfirmModal
        open={confirmMatch}
        title="Tüm eşleşen sonuçlar"
        body={`Tüm ${total.toLocaleString('tr-TR')} sonuç sunucu tarafında seçilecek. Toplu işlem bu filtreyi kullanır.`}
        confirmLabel="Tümünü seç"
        busy={false}
        onClose={() => setConfirmMatch(false)}
        onConfirm={() => {
          setSelection(selectAllMatching(filterKey, total))
          setConfirmMatch(false)
        }}
      />
    </AdminOsPageShell>
  )
}
