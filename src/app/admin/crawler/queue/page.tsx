'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { BulkToolbar } from '@/components/admin/crawler/BulkToolbar'
import { RejectReasonModal } from '@/components/admin/crawler/RejectReasonModal'
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

interface Row {
  id: string
  canonicalTitle: string | null
  aiEligibility: string
  aiEligibilityReason: string | null
  editorialDecision?: string
  uniqueSourceCount: number
  articleCount: number
  importanceScore: number
  freshnessScore: number
  ageMinutes: number
}

export default function PreAiQueuePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState('')
  const [decision, setDecision] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [approvedForAi, setApprovedForAi] = useState(0)
  const [dispatchEnabled, setDispatchEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [selection, setSelection] = useState<BulkSelectionState>(clearSelection(''))

  const filterKey = useMemo(() => selectionFilterKey({ filter, decision }), [filter, decision])
  useEffect(() => {
    setSelection((prev) => reconcileSelection(prev, filterKey))
  }, [filterKey])

  const load = useCallback(async () => {
    const q = new URLSearchParams()
    if (filter) q.set('eligibility', filter)
    if (decision) q.set('editorialDecision', decision)
    const res = await fetch(`/api/admin/crawler/queue?${q}`, { headers: await authHeaders() })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
    setRows((body.clusters || []) as Row[])
    setApprovedForAi(Number(body.approvedForAi || 0))
    setDispatchEnabled(Boolean(body.dispatchEnabled))
  }, [filter, decision])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'))
  }, [load])

  const visibleIds = rows.map((r) => r.id)
  const count = selectedCount(selection, rows.length)

  async function runBulk(op: string, extra?: { reason?: CrawlerRejectionReason; note?: string }) {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/crawler/queue/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          op,
          matchFilter: selection.mode === 'matching',
          ids: selection.mode === 'matching' ? [] : selection.ids,
          filter: { eligibility: filter || null, editorialDecision: decision || null },
          reason: extra?.reason,
          note: extra?.note,
        }),
      })
      const body = (await res.json()) as BulkResult & { error?: string }
      if (!res.ok) throw new Error(body.error || 'İşlem başarısız')
      const labels: Record<string, string> = {
        approve_for_ai: `${body.affected} olay AI için onaylandı. Dispatch KAPALI.`,
        watch: `${body.affected} olay izlemeye alındı.`,
        reject: `${body.affected} olay reddedildi.`,
        archive: `${body.affected} olay arşivlendi.`,
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

  const chips: Array<{ v: string; d: string; label: string }> = [
    { v: '', d: '', label: 'Tümü' },
    { v: 'WATCHING', d: '', label: 'İzlenen' },
    { v: 'ELIGIBLE', d: '', label: 'Uygun' },
    { v: 'HIGH_PRIORITY', d: '', label: 'Yüksek öncelik' },
    { v: 'REJECTED', d: '', label: 'Reddedildi' },
    { v: '', d: 'APPROVED_FOR_AI', label: 'Editör Onaylı' },
    { v: '', d: 'ARCHIVED', label: 'Arşiv' },
  ]

  return (
    <AdminOsPageShell title="Ön-AI Olay Kuyruğu" subtitle="İzlenen / Uygun / Yüksek öncelik / Red. Dispatch yok.">
      <CrawlerSubnav />
      <p className="mb-3 text-sm">
        AI için editör onaylı: <strong>{approvedForAi}</strong>
        <span className="ml-3 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
          AI İÇİN ONAYLANDI · Dispatch: {dispatchEnabled ? 'AÇIK' : 'KAPALI'}
        </span>
      </p>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {chips.map((chip) => (
          <button
            key={`${chip.v}-${chip.d}-${chip.label}`}
            type="button"
            onClick={() => {
              setFilter(chip.v)
              setDecision(chip.d)
            }}
            className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1"
          >
            {chip.label}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <BulkToolbar
        count={count}
        matchingHint={selection.mode === 'page' && rows.length ? `Tüm ${rows.length} sonucu seç` : null}
        onSelectMatching={() => setSelection(selectAllMatching(filterKey, rows.length))}
        onClear={() => setSelection(clearSelection(filterKey))}
      >
        <button type="button" className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1" disabled={busy} onClick={() => void runBulk('approve_for_ai')}>
          AI için Onayla
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
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1">
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
            <th className="px-2 py-1">Olay</th>
            <th className="px-2 py-1">Algoritmik</th>
            <th className="px-2 py-1">Editör</th>
            <th className="px-2 py-1">Kaynak</th>
            <th className="px-2 py-1">Haber</th>
            <th className="px-2 py-1">Önem</th>
            <th className="px-2 py-1">Yaş</th>
            <th className="px-2 py-1">Gerekçe</th>
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
              <td className="px-2 py-1">{CRAWLER_STATUS_LABELS[r.aiEligibility] || r.aiEligibility}</td>
              <td className="px-2 py-1">
                {r.editorialDecision === 'APPROVED_FOR_AI' ? (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                    AI İÇİN ONAYLANDI · Dispatch KAPALI
                  </span>
                ) : (
                  EDITORIAL_DECISION_LABELS[r.editorialDecision as keyof typeof EDITORIAL_DECISION_LABELS] || '—'
                )}
              </td>
              <td className="px-2 py-1">{r.uniqueSourceCount}</td>
              <td className="px-2 py-1">{r.articleCount}</td>
              <td className="px-2 py-1">{r.importanceScore}</td>
              <td className="px-2 py-1">{r.ageMinutes}m</td>
              <td className="px-2 py-1">{r.aiEligibilityReason}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
