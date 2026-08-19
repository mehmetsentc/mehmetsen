'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { BulkToolbar } from '@/components/admin/crawler/BulkToolbar'
import { RejectReasonModal } from '@/components/admin/crawler/RejectReasonModal'
import { ApproveForAiModal } from '@/components/admin/crawler/ApproveForAiModal'
import { CrawlerPager } from '@/components/admin/crawler/CrawlerPager'
import { notifyCrawlerBulk } from '@/components/admin/crawler/notifyBulk'
import { auth } from '@/lib/firebase/auth'
import { CRAWLER_STATUS_LABELS, EDITORIAL_DECISION_LABELS, EDITORIAL_PRIORITY_LABELS } from '@/services/crawler/editorial/labels'
import {
  crawlerEditorialStaleHours,
  requiresStaleSecondConfirm,
  staleConfirmMessage,
  staleWarning,
} from '@/services/crawler/editorial/controlPlane'
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
import type { CrawlerRejectionReason, EditorialPriority } from '@/services/crawler/types'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface Row {
  id: string
  canonicalTitle: string | null
  countryCode: string | null
  city: string | null
  aiEligibility: string
  aiEligibilityReason: string | null
  editorialDecision?: string
  editorialPriority?: string
  approvedBy?: string | null
  approvedAt?: string | null
  uniqueSourceCount: number
  articleCount: number
  sourceDiversity?: string
  importanceScore: number
  clusterConfidence: number
  ageHours: number
  ageMinutes: number
  aiStatus?: string | null
}

const TABS: Array<{ tab: string; label: string }> = [
  { tab: 'all', label: 'Tümü' },
  { tab: 'watching', label: 'İzlenen' },
  { tab: 'eligible', label: 'Uygun' },
  { tab: 'high', label: 'Yüksek Öncelik' },
  { tab: 'approved', label: 'AI İçin Onaylananlar' },
  { tab: 'rejected', label: 'Reddedildi' },
  { tab: 'archived', label: 'Arşivlenenler' },
]

export default function PreAiQueuePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [tab, setTab] = useState('all')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [district, setDistrict] = useState('')
  const [sourceId, setSourceId] = useState('')
  const [eligibility, setEligibility] = useState('')
  const [decision, setDecision] = useState('')
  const [priority, setPriority] = useState('')
  const [minSources, setMinSources] = useState('')
  const [minArticles, setMinArticles] = useState('')
  const [minImportance, setMinImportance] = useState('')
  const [minConfidence, setMinConfidence] = useState('')
  const [maxAgeHours, setMaxAgeHours] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(25)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [approvedForAi, setApprovedForAi] = useState(0)
  const [dispatchEnabled, setDispatchEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [approveOpen, setApproveOpen] = useState(false)
  const [singleId, setSingleId] = useState<string | null>(null)
  const [selection, setSelection] = useState<BulkSelectionState>(clearSelection(''))

  const filterKey = useMemo(
    () =>
      selectionFilterKey({
        tab,
        country,
        city,
        eligibility,
        decision,
        priority,
        minSources,
        minArticles,
        minImportance,
        minConfidence,
        maxAgeHours,
        dateFrom,
        dateTo,
      }),
    [tab, country, city, eligibility, decision, priority, minSources, minArticles, minImportance, minConfidence, maxAgeHours, dateFrom, dateTo]
  )
  useEffect(() => {
    setSelection((prev) => reconcileSelection(prev, filterKey))
  }, [filterKey])

  const load = useCallback(async () => {
    const q = new URLSearchParams({ tab, page: String(page), pageSize: String(pageSize) })
    if (country) q.set('country', country)
    if (city) q.set('city', city)
    if (eligibility) q.set('eligibility', eligibility)
    if (decision) q.set('editorialDecision', decision)
    if (priority) q.set('editorialPriority', priority)
    if (minSources) q.set('minSources', minSources)
    if (minArticles) q.set('minArticles', minArticles)
    if (minImportance) q.set('minImportance', minImportance)
    if (minConfidence) q.set('minConfidence', minConfidence)
    if (maxAgeHours) q.set('maxAgeHours', maxAgeHours)
    if (dateFrom) q.set('dateFrom', dateFrom)
    if (dateTo) q.set('dateTo', dateTo)
    const res = await fetch(`/api/admin/crawler/queue?${q}`, { headers: await authHeaders() })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
    setRows((body.clusters || []) as Row[])
    setTotal(Number(body.total || 0))
    setTotalPages(Number(body.totalPages || 1))
    setApprovedForAi(Number(body.approvedForAi || 0))
    setDispatchEnabled(Boolean(body.dispatchEnabled))
  }, [tab, country, city, eligibility, decision, priority, minSources, minArticles, minImportance, minConfidence, maxAgeHours, dateFrom, dateTo, page, pageSize])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'))
  }, [load])

  const visibleIds = rows.map((r) => r.id)
  const count = selectedCount(selection, total)
  const hint = pageSelectionHint(selection, pageSize)
  const selectedRows = rows.filter((r) => selection.mode === 'matching' || selection.ids.includes(r.id))
  const maxAge = Math.max(0, ...selectedRows.map((r) => r.ageHours), 0)
  const staleHrs = crawlerEditorialStaleHours()

  async function runBulk(
    op: string,
    extra?: { reason?: CrawlerRejectionReason; note?: string; editorialPriority?: EditorialPriority; confirmStale?: boolean }
  ) {
    setBusy(true)
    try {
      const ids = singleId ? [singleId] : selection.ids
      const res = await fetch('/api/admin/crawler/queue/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          op,
          matchFilter: !singleId && selection.mode === 'matching',
          ids: !singleId && selection.mode === 'matching' ? [] : ids,
          filter: {
            tab,
            country: country || null,
            city: city || null,
            eligibility: eligibility || null,
            editorialDecision: decision || null,
            editorialPriority: priority || null,
            minSources: minSources || null,
            minArticles: minArticles || null,
            minImportance: minImportance || null,
            minConfidence: minConfidence || null,
            maxAgeHours: maxAgeHours || null,
            dateFrom: dateFrom || null,
            dateTo: dateTo || null,
          },
          reason: extra?.reason,
          note: extra?.note,
          editorialPriority: extra?.editorialPriority,
          approvalSource: singleId || ids.length <= 1 ? 'cms_single' : selection.mode === 'matching' ? 'cms_bulk' : 'cms_bulk',
          selectionMode: singleId ? 'single' : selection.mode === 'matching' ? 'all_matching' : 'current_page',
          confirmStale: extra?.confirmStale === true,
        }),
      })
      const body = (await res.json()) as BulkResult & { error?: string }
      if (!res.ok) throw new Error(body.error || 'İşlem başarısız')
      const labels: Record<string, string> = {
        approve_for_ai: `${body.affected} olay AI için onaylandı. Dispatch KAPALI.`,
        watch: `${body.affected} olay izlemeye alındı.`,
        reject: `${body.affected} olay reddedildi.`,
        archive: `${body.affected} olay arşivlendi.`,
        restore: `${body.affected} olay incelemeye alındı.`,
      }
      notifyCrawlerBulk(body, labels[op] || 'İşlem tamam')
      setSelection(clearSelection(filterKey))
      setSingleId(null)
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setBusy(false)
      setRejectOpen(false)
      setApproveOpen(false)
    }
  }

  const approvedTab = tab === 'approved'

  return (
    <AdminOsPageShell title="Ön-AI Olay Kuyruğu" subtitle="Editöryal kontrol merkezi. Pipeline APPROVED_FOR_AI’da durur. Dispatch yok.">
      <CrawlerSubnav />
      <p className="mb-3 text-sm">
        AI için onaylanan: <strong>{approvedForAi}</strong>
        <span className="ml-3 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
          AI DISPATCH KAPALI
        </span>
      </p>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {TABS.map((chip) => (
          <button
            key={chip.tab}
            type="button"
            onClick={() => {
              setTab(chip.tab)
              setPage(1)
            }}
            className={`rounded-lg px-3 py-1 ${tab === chip.tab ? 'bg-[rgb(var(--color-brand))] text-white' : 'bg-[rgb(var(--color-surface))]'}`}
          >
            {chip.label}
          </button>
        ))}
      </div>
      <form
        className="mb-3 flex flex-wrap gap-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault()
          setPage(1)
          void load()
        }}
      >
        <input className="rounded border px-2 py-1" placeholder="Ülke" value={country} onChange={(e) => setCountry(e.target.value)} />
        <input className="rounded border px-2 py-1" placeholder="Şehir" value={city} onChange={(e) => setCity(e.target.value)} />
        <select className="rounded border px-2 py-1" value={eligibility} onChange={(e) => setEligibility(e.target.value)}>
          <option value="">Algoritmik uygunluk</option>
          <option value="WATCHING">İzlenen</option>
          <option value="ELIGIBLE">Uygun</option>
          <option value="HIGH_PRIORITY">Yüksek öncelik</option>
          <option value="REJECTED">Reddedildi</option>
        </select>
        <select className="rounded border px-2 py-1" value={decision} onChange={(e) => setDecision(e.target.value)}>
          <option value="">Editöryal karar</option>
          {Object.entries(EDITORIAL_DECISION_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select className="rounded border px-2 py-1" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="">Editöryal öncelik</option>
          {Object.entries(EDITORIAL_PRIORITY_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input className="w-24 rounded border px-2 py-1" placeholder="Min kaynak" value={minSources} onChange={(e) => setMinSources(e.target.value)} />
        <input className="w-24 rounded border px-2 py-1" placeholder="Min haber" value={minArticles} onChange={(e) => setMinArticles(e.target.value)} />
        <input className="w-24 rounded border px-2 py-1" placeholder="Min önem" value={minImportance} onChange={(e) => setMinImportance(e.target.value)} />
        <input className="w-28 rounded border px-2 py-1" placeholder="Min güven" value={minConfidence} onChange={(e) => setMinConfidence(e.target.value)} />
        <input className="w-28 rounded border px-2 py-1" placeholder="Max yaş (saat)" value={maxAgeHours} onChange={(e) => setMaxAgeHours(e.target.value)} />
        <input type="date" className="rounded border px-2 py-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        <input type="date" className="rounded border px-2 py-1" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        <button type="submit" className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-1 text-white">
          Filtrele
        </button>
      </form>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <BulkToolbar
        count={count}
        noun="olay"
        pageHint={hint || (selection.mode === 'page' ? `Bu sayfadakileri seç (${rows.length} olay seçildi.)` : null)}
        matchingHint={selection.mode === 'page' && total > rows.length ? `Filtreyle eşleşen tümünü seç (${total})` : null}
        onSelectMatching={() => setSelection(selectAllMatching(filterKey, total))}
        onClear={() => setSelection(clearSelection(filterKey))}
      >
        <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" disabled={busy} onClick={() => setApproveOpen(true)}>
          AI İçin Onayla
        </button>
        <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" disabled={busy} onClick={() => void runBulk('watch')}>
          İzlemeye Al
        </button>
        <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" disabled={busy} onClick={() => setRejectOpen(true)}>
          Reddet
        </button>
        <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" disabled={busy} onClick={() => void runBulk('archive')}>
          Arşivle
        </button>
        {tab === 'rejected' || tab === 'archived' ? (
          <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" disabled={busy} onClick={() => void runBulk('restore')}>
            Geri Al
          </button>
        ) : null}
      </BulkToolbar>
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1">
              <input
                type="checkbox"
                aria-label="Bu sayfadakileri seç"
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
            <th className="px-2 py-1">Başlık</th>
            <th className="px-2 py-1">Coğrafya</th>
            <th className="px-2 py-1">Kaynak</th>
            <th className="px-2 py-1">Haber</th>
            <th className="px-2 py-1">Önem</th>
            <th className="px-2 py-1">Güven</th>
            {approvedTab ? <th className="px-2 py-1">Öncelik</th> : <th className="px-2 py-1">Algoritmik</th>}
            <th className="px-2 py-1">Yaş</th>
            {approvedTab ? (
              <>
                <th className="px-2 py-1">Onaylayan</th>
                <th className="px-2 py-1">Onay zamanı</th>
                <th className="px-2 py-1">AI durumu</th>
              </>
            ) : (
              <th className="px-2 py-1">Editör</th>
            )}
            <th className="px-2 py-1" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[rgb(var(--color-border))]">
              <td className="px-2 py-1">
                <input
                  type="checkbox"
                  checked={selection.mode === 'matching' || selection.ids.includes(r.id)}
                  onChange={() => setSelection((prev) => toggleRow(prev, r.id, visibleIds))}
                />
              </td>
              <td className="px-2 py-1">
                <Link className="underline" href={`/admin/crawler/clusters/${r.id}`}>
                  {r.canonicalTitle || r.id}
                </Link>
              </td>
              <td className="px-2 py-1">{[r.countryCode, r.city].filter(Boolean).join(' / ') || '—'}</td>
              <td className="px-2 py-1">{r.sourceDiversity || r.uniqueSourceCount}</td>
              <td className="px-2 py-1">{r.articleCount}</td>
              <td className="px-2 py-1">{r.importanceScore}</td>
              <td className="px-2 py-1">{r.clusterConfidence}</td>
              {approvedTab ? (
                <td className="px-2 py-1">{EDITORIAL_PRIORITY_LABELS[r.editorialPriority || 'NORMAL']}</td>
              ) : (
                <td className="px-2 py-1">{CRAWLER_STATUS_LABELS[r.aiEligibility] || r.aiEligibility}</td>
              )}
              <td className="px-2 py-1">{Math.round(r.ageHours)}s</td>
              {approvedTab ? (
                <>
                  <td className="px-2 py-1">{r.approvedBy || '—'}</td>
                  <td className="px-2 py-1">{r.approvedAt ? new Date(r.approvedAt).toLocaleString('tr-TR') : '—'}</td>
                  <td className="px-2 py-1">{r.aiStatus || 'BEKLİYOR — AI DISPATCH KAPALI'}</td>
                </>
              ) : (
                <td className="px-2 py-1">
                  {r.editorialDecision === 'APPROVED_FOR_AI' ? (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                      AI İÇİN ONAYLANDI · Dispatch KAPALI
                    </span>
                  ) : (
                    EDITORIAL_DECISION_LABELS[r.editorialDecision as keyof typeof EDITORIAL_DECISION_LABELS] || '—'
                  )}
                </td>
              )}
              <td className="px-2 py-1">
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setSingleId(r.id)
                    setApproveOpen(true)
                  }}
                >
                  AI İçin Onayla
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <CrawlerPager
        page={page}
        totalPages={totalPages}
        total={total}
        pageSize={pageSize}
        onPage={setPage}
        onPageSize={(n) => {
          setPageSize(n)
          setPage(1)
        }}
      />
      <RejectReasonModal
        open={rejectOpen}
        count={count || 1}
        busy={busy}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason, note) => void runBulk('reject', { reason, note })}
      />
      <ApproveForAiModal
        open={approveOpen}
        count={singleId ? 1 : count || 1}
        busy={busy}
        staleWarning={staleWarning(maxAge, staleHrs)}
        staleConfirmRequired={requiresStaleSecondConfirm(maxAge)}
        staleMessage={requiresStaleSecondConfirm(maxAge) ? staleConfirmMessage(maxAge) : null}
        onClose={() => {
          setApproveOpen(false)
          setSingleId(null)
        }}
        onConfirm={(p, confirmStale) => void runBulk('approve_for_ai', { editorialPriority: p, confirmStale })}
      />
    </AdminOsPageShell>
  )
}
