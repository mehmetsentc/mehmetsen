'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface Row {
  clusterId: string
  title: string | null
  sources: string[]
  sourceCount: number
  importance: number
  localImportance: number
  eligibility: string | null
  estimatedTokens: number | null
  estimatedCostUsd: number | null
  blockedReason: string | null
  dispatchType: string
}

interface JobRow {
  clusterId: string
  eventKey: string | null
  status: string
  provider: string | null
  model: string | null
  estimatedCostUsd: number | null
  actualCostUsd: number | null
  createdAt: string | Date
  startedAt: string | Date | null
  completedAt: string | Date | null
  failure: string | null
}

interface Payload {
  automaticAi?: string
  dispatchStatus?: string
  dispatchMode?: string
  aiModeLabelTr?: string
  providerStatusLabelTr?: string
  providerReady?: boolean
  providerReason?: string | null
  gateStatus?: string
  modeNotes?: string[]
  dryRun?: string
  observationMode?: string
  actualAiRequests?: number | null
  actualAiCostUsd?: number | null
  estimatedCostLabel?: string
  pricingState?: string
  pricingReason?: string | null
  runningJobs?: number | null
  approvedBacklog?: number | null
  aiWaiting?: number | null
  costBlocked?: number
  circuit?: { state: string; reason: string | null }
  today?: { budget: number; reserved: number; spent: number; remaining: number; requests: number; requestLimit: number }
  hour?: { budget: number; reserved: number; spent: number; remaining: number; requests: number; requestLimit: number }
  month?: { budget: number; reserved: number; spent: number; remaining: number; requests: number }
  counts?: { eligible: number; ready: number; blocked: number; watching: number; processed: number }
  ready?: Row[]
  blocked?: Row[]
  watching?: Row[]
  completed?: Row[]
  failed?: Row[]
  jobs?: JobRow[]
  alert?: string | null
  dataUnavailable?: boolean
  error?: string
  shadowEconomics?:
    | {
        available: true
        evaluated: number
        uniqueEventRevisions: number
        wouldDispatch: number
        wouldBlock: number
        uniqueWouldDispatch: number
        uniqueWouldBlock: number
        lowEditorialValue: number
        estimatedSpendUsd: number | null
        estimatedPreventedUsd: number | null
        estimatedRequestsPrevented: number | null
        byPrespend: Record<string, number>
        byTier: Record<string, number>
        helpTr: string
      }
    | { available: false; displayTr: 'Veri alınamadı' }
    | null
  sourceHealth?:
    | {
        total: number
        ACTIVE: number
        PAUSED: number
        DEGRADED: number
        DISABLED: number
        topPauseReasons: Array<{ reason: string; count: number }>
      }
    | { displayTr: 'Veri alınamadı' }
    | null
  multiSourceRatio?: number | null
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toFixed(4)}`
}

function nz(n: number | null | undefined, unavailable: boolean): string {
  if (unavailable) return '—'
  if (n == null) return '—'
  return String(n)
}

function Table({ rows }: { rows: Row[] }) {
  if (rows.length === 0) {
    return <p className="text-sm text-[rgb(var(--color-muted))]">Kayıt yok.</p>
  }
  return (
    <table className="mb-6 min-w-full text-left text-sm">
      <thead>
        <tr>
          <th className="px-2 py-1">Olay</th>
          <th className="px-2 py-1">Kaynaklar</th>
          <th className="px-2 py-1">Önem</th>
          <th className="px-2 py-1">Yerel</th>
          <th className="px-2 py-1">Uygunluk</th>
          <th className="px-2 py-1">Token</th>
          <th className="px-2 py-1">Maliyet</th>
          <th className="px-2 py-1">Tür</th>
          <th className="px-2 py-1">Gerekçe</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.clusterId} className="border-t border-[rgb(var(--color-border))]">
            <td className="px-2 py-1">
              <Link className="underline" href={`/admin/crawler/clusters/${r.clusterId}`}>
                {r.title || r.clusterId}
              </Link>
            </td>
            <td className="px-2 py-1">{r.sources.slice(0, 3).join(', ') || r.sourceCount}</td>
            <td className="px-2 py-1">{r.importance}</td>
            <td className="px-2 py-1">{r.localImportance}</td>
            <td className="px-2 py-1">{r.eligibility || '—'}</td>
            <td className="px-2 py-1">{r.estimatedTokens ?? '—'}</td>
            <td className="px-2 py-1">
              {r.estimatedCostUsd == null ? 'COST_UNKNOWN' : money(r.estimatedCostUsd)}
            </td>
            <td className="px-2 py-1">{r.dispatchType}</td>
            <td className="px-2 py-1">{r.blockedReason || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function AiDispatchPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/crawler/ai-dispatch', { headers: await authHeaders() })
    const body = (await res.json()) as Payload
    if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
    setData(body)
  }, [])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'))
  }, [load])

  const unavailable = Boolean(data?.dataUnavailable)

  return (
    <AdminOsPageShell
      title="CRAWLER AI DISPATCH"
      subtitle="Phase 4D: modlar hazır, varsayılan OFF. Otomatik yayın yok. Gövde metni listelenmez."
    >
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {unavailable ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Veri alınamadı — sayaçlar sıfır gibi gösterilmez.
        </p>
      ) : null}
      <div className="mb-4 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-amber-800">AI MODU</div>
        <div className="text-3xl font-black text-amber-900">
          {data?.aiModeLabelTr || data?.dispatchMode || 'KAPALI'}
        </div>
        <div className="mt-1 text-sm text-amber-800">
          Gate: {data?.gateStatus || 'CLOSED'} · Dispatch: {data?.dispatchStatus || data?.automaticAi || 'KAPALI'}
        </div>
        <div className="mt-2 text-sm font-semibold text-amber-950">
          Provider: {data?.providerStatusLabelTr || 'KAPALI'}
          {data?.providerReason ? ` · ${data.providerReason}` : ''}
        </div>
      </div>
      {data?.shadowEconomics ? (
        <div className="mb-4 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
          <div className="mb-2 flex flex-wrap items-baseline gap-2">
            <h2 className="text-base font-semibold">Gölge ekonomi</h2>
            <span
              className="text-xs text-[rgb(var(--color-muted))]"
              title="Gölge değerlendirmeleri gerçek AI çağrısı değildir."
            >
              (Gölge değerlendirmeleri gerçek AI çağrısı değildir.)
            </span>
          </div>
          {!data.shadowEconomics.available ? (
            <p className="text-sm text-amber-800">
              {'displayTr' in data.shadowEconomics ? data.shadowEconomics.displayTr : 'Veri alınamadı'}
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 text-sm">
              <div>
                Gölge değerlendirmeleri:{' '}
                <strong>{nz(data.shadowEconomics.evaluated, unavailable)}</strong>
              </div>
              <div>
                Benzersiz olay/revizyon:{' '}
                <strong>{nz(data.shadowEconomics.uniqueEventRevisions, unavailable)}</strong>
              </div>
              <div>
                AI&apos;ya giderdi:{' '}
                <strong>{nz(data.shadowEconomics.uniqueWouldDispatch, unavailable)}</strong>
              </div>
              <div>
                Engellendi:{' '}
                <strong>{nz(data.shadowEconomics.uniqueWouldBlock, unavailable)}</strong>
              </div>
              <div>
                Düşük editoryal değer:{' '}
                <strong>
                  {nz(
                    data.shadowEconomics.available
                      ? data.shadowEconomics.lowEditorialValue
                      : null,
                    unavailable
                  )}
                </strong>
              </div>
              <div>
                Tier A:{' '}
                <strong>{nz(data.shadowEconomics.byTier?.A, unavailable)}</strong>
              </div>
              <div>
                Tier B:{' '}
                <strong>{nz(data.shadowEconomics.byTier?.B, unavailable)}</strong>
              </div>
              <div>
                Tier C:{' '}
                <strong>{nz(data.shadowEconomics.byTier?.C, unavailable)}</strong>
              </div>
              <div>
                Tier D:{' '}
                <strong>{nz(data.shadowEconomics.byTier?.D, unavailable)}</strong>
              </div>
              <div>
                Tahmini AI maliyeti:{' '}
                <strong>
                  {unavailable || data.shadowEconomics.estimatedSpendUsd == null
                    ? '—'
                    : money(data.shadowEconomics.estimatedSpendUsd)}
                </strong>
              </div>
              <div>
                Tahmini engellenen maliyet:{' '}
                <strong>
                  {unavailable || data.shadowEconomics.estimatedPreventedUsd == null
                    ? '—'
                    : money(data.shadowEconomics.estimatedPreventedUsd)}
                </strong>
              </div>
              <div>
                Tahmini engellenen istek:{' '}
                <strong>
                  {nz(
                    data.shadowEconomics.available
                      ? data.shadowEconomics.estimatedRequestsPrevented
                      : null,
                    unavailable
                  )}
                </strong>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {data?.sourceHealth ? (
        <div className="mb-4 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] p-4">
          <h2 className="mb-2 text-base font-semibold">Kaynak sağlığı</h2>
          {'displayTr' in data.sourceHealth ? (
            <p className="text-sm text-amber-800">{data.sourceHealth.displayTr}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                ACTIVE: <strong>{nz(data.sourceHealth.ACTIVE, unavailable)}</strong>
              </div>
              <div>
                PAUSED: <strong>{nz(data.sourceHealth.PAUSED, unavailable)}</strong>
              </div>
              <div>
                DEGRADED: <strong>{nz(data.sourceHealth.DEGRADED, unavailable)}</strong>
              </div>
              <div>
                Çok kaynaklı oran:{' '}
                <strong>
                  {data.multiSourceRatio == null ? 'Veri alınamadı' : `${data.multiSourceRatio}%`}
                </strong>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {data?.alert ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{data.alert}</p>
      ) : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Onaylanan backlog: <strong>{nz(data?.approvedBacklog, unavailable)}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          AI bekleyen: <strong>{nz(data?.aiWaiting, unavailable)}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Çalışan job: <strong>{nz(data?.runningJobs, unavailable)}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Cost blocked: <strong>{nz(data?.costBlocked, unavailable)}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Bugünkü crawler AI isteği: <strong>{nz(data?.actualAiRequests, unavailable)}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Gerçekleşen maliyet:{' '}
          <strong>{unavailable || data?.actualAiCostUsd == null ? '—' : money(data.actualAiCostUsd)}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Tahmini maliyet:{' '}
          <strong>
            {data?.estimatedCostLabel === 'COST_UNKNOWN' || data?.pricingReason === 'COST_UNKNOWN'
              ? 'HESAPLANAMIYOR — fiyatlandırma tanımsız'
              : data?.pricingState}
          </strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          DRY RUN: <strong>{data?.dryRun ?? 'TANIMSIZ'}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Circuit breaker: <strong>{data?.circuit?.state ?? '—'}</strong>
        </div>
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3 text-sm">
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          <div className="font-medium">Bugün</div>
          <div>
            Bütçe {money(data?.today?.budget)} · Rezerve {money(data?.today?.reserved)} · Harcanan{' '}
            {money(data?.today?.spent)} · Kalan {money(data?.today?.remaining)}
          </div>
          <div>
            İstek {data?.today?.requests ?? 0} / {data?.today?.requestLimit ?? 0}
          </div>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          <div className="font-medium">Bu saat</div>
          <div>
            Bütçe {money(data?.hour?.budget)} · Rezerve {money(data?.hour?.reserved)} · Harcanan{' '}
            {money(data?.hour?.spent)} · Kalan {money(data?.hour?.remaining)}
          </div>
          <div>
            İstek {data?.hour?.requests ?? 0} / {data?.hour?.requestLimit ?? 0}
          </div>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          <div className="font-medium">Bu ay</div>
          <div>
            Bütçe {money(data?.month?.budget)} · Rezerve {money(data?.month?.reserved)} · Harcanan{' '}
            {money(data?.month?.spent)} · Kalan {money(data?.month?.remaining)}
          </div>
        </div>
      </div>
      <h2 className="mb-2 text-base font-semibold">Jobs</h2>
      {(data?.jobs || []).length === 0 ? (
        <p className="mb-6 text-sm text-[rgb(var(--color-muted))]">Job yok.</p>
      ) : (
        <table className="mb-6 min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1">Olay</th>
              <th className="px-2 py-1">Durum</th>
              <th className="px-2 py-1">Provider</th>
              <th className="px-2 py-1">Model</th>
              <th className="px-2 py-1">Tahmini</th>
              <th className="px-2 py-1">Gerçek</th>
              <th className="px-2 py-1">Hata</th>
            </tr>
          </thead>
          <tbody>
            {(data?.jobs || []).map((j) => (
              <tr key={`${j.clusterId}-${j.status}-${String(j.createdAt)}`} className="border-t border-[rgb(var(--color-border))]">
                <td className="px-2 py-1">
                  <Link className="underline" href={`/admin/crawler/clusters/${j.clusterId}`}>
                    {j.eventKey || j.clusterId}
                  </Link>
                </td>
                <td className="px-2 py-1">{j.status}</td>
                <td className="px-2 py-1">{j.provider || '—'}</td>
                <td className="px-2 py-1">{j.model || '—'}</td>
                <td className="px-2 py-1">{money(j.estimatedCostUsd)}</td>
                <td className="px-2 py-1">{money(j.actualCostUsd)}</td>
                <td className="px-2 py-1">{j.failure || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h2 className="mb-2 text-base font-semibold">Hazır</h2>
      <Table rows={data?.ready || []} />
      <h2 className="mb-2 text-base font-semibold">Engelli</h2>
      <Table rows={data?.blocked || []} />
      <h2 className="mb-2 text-base font-semibold">İzlenen</h2>
      <Table rows={data?.watching || []} />
      <h2 className="mb-2 text-base font-semibold">Tamamlanan</h2>
      <Table rows={data?.completed || []} />
      <h2 className="mb-2 text-base font-semibold">Başarısız</h2>
      <Table rows={data?.failed || []} />
    </AdminOsPageShell>
  )
}
