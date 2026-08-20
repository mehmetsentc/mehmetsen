'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type WindowAgg = {
  label: string
  requests: number
  successfulDrafts: number
  failedDrafts: number
  inputTokens: number
  outputTokens: number
  actualCostUsd: number
  avgCostPerDraft: number | null
  avgCostPerSuccessfulDraft: number | null
  byProvider: Record<string, { requests: number; costUsd: number }>
  byModel: Record<string, { requests: number; costUsd: number }>
  byFailure: Record<string, number>
}

/**
 * AI Maliyet — aggregate CMS (no per-render full ledger scan explosion).
 */
export default function AiCostPage() {
  const [windows, setWindows] = useState<WindowAgg[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/crawler/ai-dispatch', { headers: await authHeaders() })
    const body = (await res.json()) as {
      costAggregates?: {
        unavailable?: boolean
        windows?: WindowAgg[] | null
        error?: string
      } | null
      dataUnavailable?: boolean
      alert?: string | null
      error?: string
    }
    if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
    if (body.dataUnavailable || body.costAggregates?.unavailable) {
      setUnavailable(true)
      setWindows(null)
      setError(body.alert || body.costAggregates?.error || 'Veri kaynağına ulaşılamıyor')
      return
    }
    setUnavailable(false)
    setWindows(body.costAggregates?.windows || [])
  }, [])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'))
  }, [load])

  const labelTr: Record<string, string> = { today: 'Bugün', '7d': '7 Gün', '30d': '30 Gün' }

  return (
    <AdminOsPageShell
      title="AI Maliyet"
      subtitle="Ledger aggregate özetleri. Sayfa her render’da ham transaction taramaz."
    >
      <CrawlerSubnav />
      {unavailable || error ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {unavailable ? 'Veri kaynağına ulaşılamıyor' : error}
        </p>
      ) : null}
      {!unavailable && windows ? (
        <div className="grid gap-4 md:grid-cols-3">
          {windows.map((w) => (
            <div key={w.label} className="rounded-lg border border-[rgb(var(--color-border))] p-4 text-sm">
              <div className="mb-2 text-base font-semibold">{labelTr[w.label] || w.label}</div>
              <div>İstek: {w.requests}</div>
              <div>Başarılı taslak: {w.successfulDrafts}</div>
              <div>Başarısız: {w.failedDrafts}</div>
              <div>Input token: {w.inputTokens}</div>
              <div>Output token: {w.outputTokens}</div>
              <div>Gerçek maliyet: ${w.actualCostUsd.toFixed(4)}</div>
              <div>
                Ort. maliyet/taslak:{' '}
                {w.avgCostPerDraft == null ? '—' : `$${w.avgCostPerDraft.toFixed(4)}`}
              </div>
              <div>
                Ort. başarılı:{' '}
                {w.avgCostPerSuccessfulDraft == null
                  ? '—'
                  : `$${w.avgCostPerSuccessfulDraft.toFixed(4)}`}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {!unavailable && windows?.length === 0 ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">Henüz ledger kaydı yok ($0 Stage 1).</p>
      ) : null}
    </AdminOsPageShell>
  )
}
