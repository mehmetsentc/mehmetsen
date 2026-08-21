'use client'

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import toast from 'react-hot-toast'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type ListItem = {
  jobId: string
  draftId: string | null
  clusterId: string
  eventKey: string | null
  title: string
  status: string
  statusLabelTr: string
  provider: string | null
  model: string | null
  sourceName: string | null
  sourceCount: number
  wordCount: number | null
  costUsd: number | null
  costDisplay: string
  costPrecise: string | null
  qualityCode: string
  qualityLabelTr: string
  createdAt: string | Date
  completedAt: string | Date | null
  failureCode: string | null
  failureReason: string | null
  failureReasonTr?: string
}

type Detail = ListItem & {
  spot: string | null
  summary: string | null
  body: string | null
  tags: string[]
  category: string | null
  seoTitle: string | null
  seoDescription: string | null
  seoKeywords: string[]
  socialTitle: string | null
  socialDescription: string | null
  pushTitle: string | null
  pushText: string | null
  imageAlt: string | null
  imageFilename: string | null
  primarySource: {
    sourceName?: string
    title?: string | null
    url?: string | null
    wordCount?: number | null
    extractionConfidence?: number | null
    healthScore?: number | null
    role?: string
  } | null
  supportingSources: Array<{
    sourceName?: string
    title?: string | null
    url?: string | null
    wordCount?: number | null
    extractionConfidence?: number | null
    healthScore?: number | null
    role?: string
  }>
  quality: { code: string; labelTr: string; reasonsTr: string[]; bodyWords: number }
}

function fmtDate(v: string | Date | null | undefined): string {
  if (!v) return '—'
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('tr-TR')
}

/**
 * AI_DRAFT editor queue — Phase 4D.4.
 * Manual publish only; no crawler auto-publish; no paid AI on this page.
 */
export default function AiDraftsPage() {
  return (
    <Suspense
      fallback={
        <AdminOsPageShell title="AI Taslakları" subtitle="Yükleniyor…">
          <p>Yükleniyor…</p>
        </AdminOsPageShell>
      }
    >
      <AiDraftsPageInner />
    </Suspense>
  )
}

function AiDraftsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab') === 'failed' ? 'failed' : 'completed'
  const page = Number(searchParams.get('page') || '1')
  const pageSize = Number(searchParams.get('pageSize') || '25')
  const sort = searchParams.get('sort') || 'createdAt'
  const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc'
  const quality = searchParams.get('quality') || ''

  const [items, setItems] = useState<ListItem[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [counts, setCounts] = useState({ completed: 0, failed: 0 })
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)
  const [detail, setDetail] = useState<Detail | null>(null)
  const [busy, setBusy] = useState(false)

  const queryString = useMemo(() => {
    const q = new URLSearchParams()
    q.set('tab', tab)
    q.set('page', String(page))
    q.set('pageSize', String([25, 50, 100].includes(pageSize) ? pageSize : 25))
    q.set('sort', sort)
    q.set('order', order)
    if (quality) q.set('quality', quality)
    return q.toString()
  }, [tab, page, pageSize, sort, order, quality])

  const setParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === '') next.delete(k)
        else next.set(k, v)
      }
      router.push(`/admin/crawler/ai-drafts?${next.toString()}`)
    },
    [router, searchParams]
  )

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/crawler/ai-drafts?${queryString}`, {
      headers: await authHeaders(),
    })
    const body = (await res.json()) as {
      items?: ListItem[]
      total?: number
      totalPages?: number
      counts?: { completed: number; failed: number }
      dataUnavailable?: boolean
      error?: string
    }
    if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
    if (body.dataUnavailable) {
      setUnavailable(true)
      setError(body.error || 'Veri kaynağına ulaşılamıyor')
      setItems([])
      return
    }
    setUnavailable(false)
    setError(null)
    setItems(body.items || [])
    setTotal(body.total || 0)
    setTotalPages(body.totalPages || 1)
    if (body.counts) setCounts(body.counts)
  }, [queryString])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'))
  }, [load])

  async function openDetail(jobId: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/crawler/ai-drafts/${encodeURIComponent(jobId)}`, {
        headers: await authHeaders(),
      })
      const body = (await res.json()) as { draft?: Detail; error?: string }
      if (!res.ok) throw new Error(body.error || 'Detay yüklenemedi')
      setDetail(body.draft || null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Detay yüklenemedi')
    } finally {
      setBusy(false)
    }
  }

  async function openEditor(jobId: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/crawler/ai-drafts/${encodeURIComponent(jobId)}`, {
        method: 'POST',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'open_editor' }),
      })
      const body = (await res.json()) as { editPath?: string; error?: string; messageTr?: string }
      if (!res.ok) throw new Error(body.error || body.messageTr || 'Editör açılamadı')
      if (body.editPath) {
        toast.success(body.messageTr || 'Editöre aktarıldı')
        window.location.href = body.editPath
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Editör açılamadı')
    } finally {
      setBusy(false)
    }
  }

  async function rejectDraft(jobId: string) {
    if (!window.confirm('Bu AI taslağını reddetmek istiyor musunuz? Silinmez; yeniden üretilmez.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/crawler/ai-drafts/${encodeURIComponent(jobId)}`, {
        method: 'PATCH',
        headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: 'editor_reject' }),
      })
      const body = (await res.json()) as { messageTr?: string; error?: string }
      if (!res.ok) throw new Error(body.error || 'Reddedilemedi')
      toast.success(body.messageTr || 'Reddedildi')
      setDetail(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reddedilemedi')
    } finally {
      setBusy(false)
    }
  }

  function toggleSort(field: string) {
    if (sort === field) {
      setParams({ order: order === 'desc' ? 'asc' : 'desc', page: '1' })
    } else {
      setParams({ sort: field, order: 'desc', page: '1' })
    }
  }

  return (
    <AdminOsPageShell
      title="AI Taslakları"
      subtitle="AI_DRAFT kuyruğu. Yayın için manuel onay gerekir. Otomatik yayın yok. Bu sayfa AI çağırmaz."
    >
      <CrawlerSubnav />
      {error ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {unavailable ? 'Veri kaynağına ulaşılamıyor' : error}
        </p>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          className={`rounded px-3 py-1 ${tab === 'completed' ? 'bg-[rgb(var(--color-surface))] font-semibold' : 'underline'}`}
          onClick={() => setParams({ tab: 'completed', page: '1' })}
        >
          Tamamlanan Taslaklar ({counts.completed})
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1 ${tab === 'failed' ? 'bg-[rgb(var(--color-surface))] font-semibold' : 'underline'}`}
          onClick={() => setParams({ tab: 'failed', page: '1' })}
        >
          Başarısız AI İşleri ({counts.failed})
        </button>
        <label className="ml-auto flex items-center gap-2">
          Sayfa boyutu
          <select
            className="rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-1"
            value={[25, 50, 100].includes(pageSize) ? pageSize : 25}
            onChange={(e) => setParams({ pageSize: e.target.value, page: '1' })}
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Kalite
          <select
            className="rounded border border-[rgb(var(--color-border))] bg-transparent px-2 py-1"
            value={quality}
            onChange={(e) => setParams({ quality: e.target.value || null, page: '1' })}
          >
            <option value="">Tümü</option>
            <option value="OK">Uygun</option>
            <option value="QUALITY_WARNING">Kalite Kontrolü Gerekli</option>
          </select>
        </label>
      </div>

      {items.length === 0 && !unavailable ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">
          {tab === 'failed' ? 'Başarısız AI işi yok.' : 'Tamamlanan AI taslağı yok.'}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr>
                <th className="px-2 py-1">
                  <button type="button" className="underline" onClick={() => toggleSort('createdAt')}>
                    Başlık / Olay
                  </button>
                </th>
                <th className="px-2 py-1">
                  <button type="button" className="underline" onClick={() => toggleSort('status')}>
                    Durum
                  </button>
                </th>
                <th className="px-2 py-1">Kaynak</th>
                <th className="px-2 py-1">Kaynak sayısı</th>
                <th className="px-2 py-1">Model</th>
                <th className="px-2 py-1">
                  <button type="button" className="underline" onClick={() => toggleSort('cost')}>
                    Maliyet
                  </button>
                </th>
                <th className="px-2 py-1">
                  <button type="button" className="underline" onClick={() => toggleSort('wordCount')}>
                    Kelime sayısı
                  </button>
                </th>
                <th className="px-2 py-1">Kalite Durumu</th>
                <th className="px-2 py-1">Oluşturulma</th>
                <th className="px-2 py-1">Aksiyonlar</th>
              </tr>
            </thead>
            <tbody>
              {items.map((j) => (
                <tr key={j.jobId} className="border-t border-[rgb(var(--color-border))]">
                  <td className="px-2 py-2">
                    <div className="font-medium">{j.title}</div>
                    <Link className="text-xs underline" href={`/admin/crawler/clusters/${j.clusterId}`}>
                      {j.eventKey || j.clusterId}
                    </Link>
                  </td>
                  <td className="px-2 py-2">{j.statusLabelTr}</td>
                  <td className="px-2 py-2">{j.sourceName || '—'}</td>
                  <td className="px-2 py-2">{j.sourceCount}</td>
                  <td className="px-2 py-2">{j.model || '—'}</td>
                  <td className="px-2 py-2" title={j.costPrecise || undefined}>
                    {j.costDisplay}
                  </td>
                  <td className="px-2 py-2">{j.wordCount ?? '—'}</td>
                  <td className="px-2 py-2">
                    <span
                      className={
                        j.qualityCode === 'QUALITY_WARNING'
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-emerald-700 dark:text-emerald-400'
                      }
                    >
                      {j.qualityLabelTr}
                    </span>
                  </td>
                  <td className="px-2 py-2">{fmtDate(j.createdAt)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      {tab === 'completed' ? (
                        <>
                          <button type="button" className="underline" disabled={busy} onClick={() => openDetail(j.jobId)}>
                            Görüntüle
                          </button>
                          <button type="button" className="underline" disabled={busy} onClick={() => openEditor(j.jobId)}>
                            Düzenle
                          </button>
                          <button type="button" className="underline" disabled={busy} onClick={() => rejectDraft(j.jobId)}>
                            Reddet
                          </button>
                          <span className="text-[rgb(var(--color-muted))]" title="Yalnızca editörde, açık insan komutu ile">
                            Yayınla*
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-[rgb(var(--color-muted))]">
                          {j.failureReasonTr || j.failureCode || j.failureReason || '—'}
                          {j.failureCode ? (
                            <span className="ml-1 text-[10px] text-[rgb(var(--color-muted))]">({j.failureCode})</span>
                          ) : null}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3 text-sm">
        <button
          type="button"
          className="underline disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => setParams({ page: String(page - 1) })}
        >
          Önceki
        </button>
        <span>
          Sayfa {page} / {totalPages} · Toplam {total}
        </span>
        <button
          type="button"
          className="underline disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => setParams({ page: String(page + 1) })}
        >
          Sonraki
        </button>
      </div>
      <p className="mt-2 text-xs text-[rgb(var(--color-muted))]">
        * Yayınla: AdminNewsEditor içinde, kimliği doğrulanmış editör + news:publish. Bu listeden veya worker’dan yayın yok.
      </p>

      {detail ? (
        <div className="fixed inset-0 z-modal flex items-start justify-end bg-black/40" role="presentation">
          <button type="button" className="absolute inset-0" aria-label="Kapat" onClick={() => setDetail(null)} />
          <aside
            role="dialog"
            aria-modal="true"
            className="relative z-10 flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-[rgb(var(--color-card))] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <h2 className="text-lg font-semibold">{detail.title}</h2>
              <button type="button" className="underline" onClick={() => setDetail(null)}>
                Kapat
              </button>
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-[rgb(var(--color-muted))]">Durum</dt>
              <dd>{detail.statusLabelTr}</dd>
              <dt className="text-[rgb(var(--color-muted))]">Kalite Durumu</dt>
              <dd>{detail.quality?.labelTr || detail.qualityLabelTr}</dd>
              <dt className="text-[rgb(var(--color-muted))]">Kelime</dt>
              <dd>{detail.wordCount ?? detail.quality?.bodyWords ?? '—'}</dd>
              <dt className="text-[rgb(var(--color-muted))]">AI maliyeti</dt>
              <dd title={detail.costPrecise || undefined}>{detail.costDisplay}</dd>
              <dt className="text-[rgb(var(--color-muted))]">Sağlayıcı</dt>
              <dd>{detail.provider || '—'}</dd>
              <dt className="text-[rgb(var(--color-muted))]">Model</dt>
              <dd>{detail.model || '—'}</dd>
              <dt className="text-[rgb(var(--color-muted))]">Oluşturulma zamanı</dt>
              <dd>{fmtDate(detail.createdAt)}</dd>
              <dt className="text-[rgb(var(--color-muted))]">Kategori</dt>
              <dd>{detail.category || '—'}</dd>
            </dl>
            {detail.quality?.reasonsTr?.length ? (
              <ul className="mt-2 list-disc pl-5 text-sm text-amber-800 dark:text-amber-300">
                {detail.quality.reasonsTr.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : null}
            <section className="mt-4 space-y-2 text-sm">
              <h3 className="font-semibold">Spot</h3>
              <p>{detail.spot || '—'}</p>
              <h3 className="font-semibold">Özet</h3>
              <p>{detail.summary || '—'}</p>
              <h3 className="font-semibold">Haber İçeriği</h3>
              <p className="whitespace-pre-wrap">{detail.body || '—'}</p>
              <h3 className="font-semibold">Etiketler</h3>
              <p>{(detail.tags || []).join(', ') || '—'}</p>
              <h3 className="font-semibold">SEO</h3>
              <p>
                {detail.seoTitle || '—'}
                <br />
                {detail.seoDescription || '—'}
                <br />
                {(detail.seoKeywords || []).join(', ') || '—'}
              </p>
              <h3 className="font-semibold">Sosyal Medya</h3>
              <p>
                {detail.socialTitle || '—'}
                <br />
                {detail.socialDescription || '—'}
              </p>
              <h3 className="font-semibold">Push Bildirim</h3>
              <p>
                {detail.pushTitle || '—'}
                <br />
                {detail.pushText || '—'}
              </p>
              <h3 className="font-semibold">Görsel</h3>
              <p>
                ALT: {detail.imageAlt || '—'}
                <br />
                Dosya: {detail.imageFilename || '—'}
              </p>
              <h3 className="font-semibold">Kaynaklar</h3>
              {detail.primarySource ? (
                <div className="rounded border border-[rgb(var(--color-border))] p-2">
                  <p className="font-medium">PRIMARY — {detail.primarySource.sourceName || '—'}</p>
                  <p>{detail.primarySource.title || '—'}</p>
                  {detail.primarySource.url ? (
                    <a className="underline" href={detail.primarySource.url} target="_blank" rel="noreferrer">
                      {detail.primarySource.url}
                    </a>
                  ) : (
                    <p className="text-[rgb(var(--color-muted))]">URL snapshot’ta yok (yeniden crawl yok)</p>
                  )}
                  <p className="text-xs text-[rgb(var(--color-muted))]">
                    Kelime: {detail.primarySource.wordCount ?? '—'} · Güven:{' '}
                    {detail.primarySource.extractionConfidence != null
                      ? `${Math.round(detail.primarySource.extractionConfidence * 100)}%`
                      : '—'}{' '}
                    · Kaynak Sağlığı: {detail.primarySource.healthScore ?? '—'}
                  </p>
                </div>
              ) : (
                <p>—</p>
              )}
              {detail.supportingSources?.map((s, i) => (
                <div key={i} className="rounded border border-[rgb(var(--color-border))] p-2">
                  <p className="font-medium">SUPPORTING — {s.sourceName || '—'}</p>
                  <p>{s.title || '—'}</p>
                  {s.url ? (
                    <a className="underline" href={s.url} target="_blank" rel="noreferrer">
                      {s.url}
                    </a>
                  ) : null}
                  <p className="text-xs text-[rgb(var(--color-muted))]">
                    Kelime: {s.wordCount ?? '—'} · Güven:{' '}
                    {s.extractionConfidence != null ? `${Math.round(s.extractionConfidence * 100)}%` : '—'} ·
                    Kaynak Sağlığı: {s.healthScore ?? '—'}
                  </p>
                </div>
              ))}
            </section>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <button type="button" className="underline" disabled={busy} onClick={() => openEditor(detail.jobId)}>
                Düzenle
              </button>
              <button type="button" className="underline" disabled={busy} onClick={() => rejectDraft(detail.jobId)}>
                Reddet
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </AdminOsPageShell>
  )
}
