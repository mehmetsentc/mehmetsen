'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { BulkToolbar } from '@/components/admin/crawler/BulkToolbar'
import { RejectReasonModal } from '@/components/admin/crawler/RejectReasonModal'
import { RowOverflowMenu } from '@/components/admin/crawler/RowOverflowMenu'
import { notifyCrawlerBulk } from '@/components/admin/crawler/notifyBulk'
import { auth } from '@/lib/firebase/auth'
import { CRAWLER_STATUS_LABELS, EDITORIAL_DECISION_LABELS } from '@/services/crawler/editorial/labels'
import {
  clearSelection,
  reconcileSelection,
  selectAllMatching,
  selectCurrentPage,
  selectedCount,
  selectionFilterKey,
  toggleRow,
  type BulkSelectionState,
} from '@/services/crawler/editorial/selection'
import type { BulkResult } from '@/services/crawler/editorial/bulk'
import type { CrawlerRejectionReason } from '@/services/crawler/types'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface ClusterRow {
  id: string
  canonicalTitle: string | null
  status: string
  countryCode: string | null
  city: string | null
  firstSeenAt: string
  lastSeenAt: string
  articleCount: number
  uniqueSourceCount: number
  clusterConfidence: number
  importanceScore: number
  aiEligibility: string
  editorialDecision?: string
}

export default function CrawlerClustersPage() {
  const [rows, setRows] = useState<ClusterRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [hours, setHours] = useState('24')
  const [country, setCountry] = useState('')
  const [city, setCity] = useState('')
  const [eligibility, setEligibility] = useState('')
  const [decision, setDecision] = useState('')
  const [minSources, setMinSources] = useState('')
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [selection, setSelection] = useState<BulkSelectionState>(clearSelection(''))

  const filterKey = useMemo(
    () => selectionFilterKey({ hours, country, city, eligibility, decision, minSources }),
    [hours, country, city, eligibility, decision, minSources]
  )

  useEffect(() => {
    setSelection((prev) => reconcileSelection(prev, filterKey))
  }, [filterKey])

  const load = useCallback(async () => {
    setError(null)
    const q = new URLSearchParams({ hours })
    if (country) q.set('country', country)
    if (city) q.set('city', city)
    if (eligibility) q.set('eligibility', eligibility)
    if (decision) q.set('editorialDecision', decision)
    if (minSources) q.set('minSources', minSources)
    const res = await fetch(`/api/admin/crawler/clusters?${q}`, { headers: await authHeaders() })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
    setRows((body.clusters || []) as ClusterRow[])
  }, [hours, country, city, eligibility, decision, minSources])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'))
  }, [load])

  const visibleIds = rows.map((r) => r.id)
  const count = selectedCount(selection, rows.length)

  async function runBulk(op: string, extra?: { reason?: CrawlerRejectionReason; note?: string; ids?: string[] }) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/crawler/clusters/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          op,
          matchFilter: !extra?.ids && selection.mode === 'matching',
          ids: extra?.ids || (selection.mode === 'matching' ? [] : selection.ids),
          filter: { country, city, eligibility, editorialDecision: decision || null },
          reason: extra?.reason,
          note: extra?.note,
        }),
      })
      const body = (await res.json()) as BulkResult & { error?: string }
      if (!res.ok) throw new Error(body.error || 'İşlem başarısız')
      const labels: Record<string, string> = {
        approve_for_ai: `${body.affected} küme AI adayı yapıldı. Dispatch KAPALI.`,
        watch: `${body.affected} küme izlemeye alındı.`,
        reject: `${body.affected} küme reddedildi.`,
        archive: `${body.affected} küme arşivlendi.`,
      }
      notifyCrawlerBulk(body, labels[op] || 'İşlem tamam')
      setSelection(clearSelection(filterKey))
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'İşlem başarısız')
    } finally {
      setBusy(false)
      setRejectOpen(false)
    }
  }

  return (
    <AdminOsPageShell title="Olay Kümeleri" subtitle="Belirleyici kümeler. AI yok. Editör kararı algoritmik eligibiliteden ayrıdır.">
      <CrawlerSubnav />
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        <select value={hours} onChange={(e) => setHours(e.target.value)} className="rounded border px-2 py-1">
          <option value="6">6s</option>
          <option value="24">24s</option>
          <option value="72">72s</option>
        </select>
        <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="ülke" className="w-20 rounded border px-2 py-1" />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="şehir" className="w-28 rounded border px-2 py-1" />
        <select value={eligibility} onChange={(e) => setEligibility(e.target.value)} className="rounded border px-2 py-1">
          <option value="">Algoritmik kapı</option>
          <option value="WATCHING">İzlenen</option>
          <option value="ELIGIBLE">Uygun</option>
          <option value="HIGH_PRIORITY">Yüksek öncelik</option>
          <option value="REJECTED">Reddedildi</option>
        </select>
        <select value={decision} onChange={(e) => setDecision(e.target.value)} className="rounded border px-2 py-1">
          <option value="">Editör kararı</option>
          <option value="NONE">Karar yok</option>
          <option value="APPROVED_FOR_AI">AI için onaylı</option>
          <option value="WATCHING">İzlemeye alındı</option>
          <option value="REJECTED">Reddedildi</option>
          <option value="ARCHIVED">Arşiv</option>
        </select>
        <input value={minSources} onChange={(e) => setMinSources(e.target.value)} placeholder="min sources" className="w-28 rounded border px-2 py-1" />
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <BulkToolbar
        count={count}
        matchingHint={selection.mode === 'page' && rows.length ? `Tüm ${rows.length} sonucu seç` : null}
        onSelectMatching={() => setSelection(selectAllMatching(filterKey, rows.length))}
        onClear={() => setSelection(clearSelection(filterKey))}
      >
        <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" disabled={busy} onClick={() => void runBulk('approve_for_ai')}>
          AI Adayı Yap
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
      </BulkToolbar>
      <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[rgb(var(--color-surface))] text-[11px] uppercase text-[rgb(var(--color-muted))]">
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
                        : selectCurrentPage(visibleIds, filterKey, rows.length)
                    )
                  }
                />
              </th>
              <th className="px-3 py-2">Başlık</th>
              <th className="px-3 py-2">Durum</th>
              <th className="px-3 py-2">Coğrafya</th>
              <th className="px-3 py-2">Haber</th>
              <th className="px-3 py-2">Kaynak</th>
              <th className="px-3 py-2">Önem</th>
              <th className="px-3 py-2">Güven</th>
              <th className="px-3 py-2">Algoritmik</th>
              <th className="px-3 py-2">Editör</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-[rgb(var(--color-border))]">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selection.mode === 'matching' || selection.ids.includes(c.id)}
                    onChange={() => setSelection((prev) => toggleRow(prev, c.id, visibleIds))}
                  />
                </td>
                <td className="px-3 py-2">
                  <Link href={`/admin/crawler/clusters/${c.id}`} className="underline">
                    {c.canonicalTitle || c.id}
                  </Link>
                </td>
                <td className="px-3 py-2">{c.status}</td>
                <td className="px-3 py-2">{[c.countryCode, c.city].filter(Boolean).join(' / ') || '—'}</td>
                <td className="px-3 py-2">{c.articleCount}</td>
                <td className="px-3 py-2">{c.uniqueSourceCount}</td>
                <td className="px-3 py-2">{c.importanceScore}</td>
                <td className="px-3 py-2">{c.clusterConfidence?.toFixed?.(2) ?? c.clusterConfidence}</td>
                <td className="px-3 py-2">{CRAWLER_STATUS_LABELS[c.aiEligibility] || c.aiEligibility}</td>
                <td className="px-3 py-2">
                  {EDITORIAL_DECISION_LABELS[c.editorialDecision as keyof typeof EDITORIAL_DECISION_LABELS] ||
                    c.editorialDecision ||
                    '—'}
                </td>
                <td className="px-3 py-2">
                  <RowOverflowMenu
                    items={[
                      { label: 'AI Adayı Yap', onClick: () => void runBulk('approve_for_ai', { ids: [c.id] }) },
                      { label: 'İzlemeye Al', onClick: () => void runBulk('watch', { ids: [c.id] }) },
                      {
                        label: 'Reddet',
                        onClick: () => {
                          setSelection({ ids: [c.id], mode: 'none', matchingTotal: 1, filterKey })
                          setRejectOpen(true)
                        },
                      },
                      { label: 'Arşivle', onClick: () => void runBulk('archive', { ids: [c.id] }) },
                    ]}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <RejectReasonModal
        open={rejectOpen}
        count={count || 1}
        busy={busy}
        onClose={() => setRejectOpen(false)}
        onConfirm={(reason, note) => void runBulk('reject', { reason, note })}
      />
    </AdminOsPageShell>
  )
}
