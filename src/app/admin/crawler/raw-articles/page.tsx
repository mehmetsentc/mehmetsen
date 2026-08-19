'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'
import { EDITORIAL_STATUS_LABELS, crawlerStatusLabel } from '@/services/crawler/editorial/labels'
import { numberedPages, RAW_ARTICLE_PAGE_SIZES } from '@/services/crawler/editorial/query'
import type { CrawlerEditorialStatus } from '@/services/crawler/types'

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
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

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
      </div>
    )
  }

  function renderTable(list: ArticleRow[]) {
    return (
      <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgb(var(--color-surface))] text-[11px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
            <tr>
              <th className="px-3 py-2">Görsel</th>
              <th className="px-3 py-2">Başlık</th>
              <th className="px-3 py-2">Kaynak</th>
              <th className="px-3 py-2">Ülke</th>
              <th className="px-3 py-2">Tarih</th>
              <th className="px-3 py-2">Kelime</th>
              <th className="px-3 py-2">Güven</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Editoryal</th>
              <th className="px-3 py-2">İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {list.map((row) => (
              <tr key={row.id} className="border-t border-[rgb(var(--color-border))]">
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
                <td className="px-3 py-6 text-[rgb(var(--color-muted))]" colSpan={10}>
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
        <div className="rounded-2xl border border-[rgb(var(--color-border))] p-4 text-sm">
          {detail.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={detail.mainImageUrl} alt="" className="mb-3 max-h-56 rounded object-cover" />
          ) : null}
          <div className="mb-2 font-semibold">{detail.title}</div>
          <div className="text-[rgb(var(--color-muted))]">
            {detail.sourceName} · {fmt(detail.wordCount ?? undefined)} kelime
          </div>
          <p className="mt-2">{detail.description}</p>
          <p className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap text-[rgb(var(--color-muted))]">
            {(detail.articleBodyText || '').slice(0, 2000)}
            {(detail.articleBodyText || '').length > 2000 ? '…' : ''}
          </p>
          <div className="mt-3">{renderActions(detail)}</div>
          <button type="button" className="mt-2 text-xs underline" onClick={() => setDetail(null)}>
            Kapat
          </button>
        </div>
      ) : null}
    </AdminOsPageShell>
  )
}
