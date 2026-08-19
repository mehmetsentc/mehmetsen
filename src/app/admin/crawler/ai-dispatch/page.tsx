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

interface Payload {
  automaticAi?: string
  dispatchStatus?: string
  dryRun?: string
  observationMode?: string
  actualAiRequests?: number
  actualAiCostUsd?: number
  estimatedCostLabel?: string
  pricingState?: string
  pricingReason?: string | null
  runningJobs?: number
  approvedBacklog?: number
  aiWaiting?: number
  circuit?: { state: string; reason: string | null }
  today?: { budget: number; reserved: number; spent: number; remaining: number; requests: number; requestLimit: number }
  hour?: { budget: number; reserved: number; spent: number; remaining: number; requests: number; requestLimit: number }
  counts?: { eligible: number; ready: number; blocked: number; watching: number; processed: number }
  ready?: Row[]
  blocked?: Row[]
  watching?: Row[]
  completed?: Row[]
  failed?: Row[]
  alert?: string | null
  error?: string
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${n.toFixed(4)}`
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

  return (
    <AdminOsPageShell
      title="CRAWLER AI DISPATCH"
      subtitle="Otomatik DeepSeek kapalı. Gölge kuyruk: ne gönderilirdi. Gövde metni listelenmez."
    >
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="mb-4 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-center">
        <div className="text-xs uppercase tracking-wide text-amber-800">CRAWLER AI DISPATCH</div>
        <div className="text-3xl font-black text-amber-900">{data?.dispatchStatus || data?.automaticAi || 'KAPALI'}</div>
      </div>
      {data?.alert ? (
        <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{data.alert}</p>
      ) : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Onaylanan backlog: <strong>{data?.approvedBacklog ?? 0}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          AI bekleyen: <strong>{data?.aiWaiting ?? 0}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Çalışan job: <strong>{data?.runningJobs ?? 0}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Bugünkü crawler AI isteği: <strong>{data?.actualAiRequests ?? 0}</strong>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          Gerçekleşen maliyet: <strong>${(data?.actualAiCostUsd ?? 0).toFixed(4)}</strong>
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
      <div className="mb-6 grid gap-3 sm:grid-cols-2 text-sm">
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          <div className="font-medium">Bugün</div>
          <div>Bütçe {money(data?.today?.budget)} · Rezerve {money(data?.today?.reserved)} · Harcanan {money(data?.today?.spent)} · Kalan {money(data?.today?.remaining)}</div>
          <div>İstek {data?.today?.requests ?? 0} / {data?.today?.requestLimit ?? 0}</div>
        </div>
        <div className="rounded-lg bg-[rgb(var(--color-surface))] p-3">
          <div className="font-medium">Bu saat</div>
          <div>Bütçe {money(data?.hour?.budget)} · Rezerve {money(data?.hour?.reserved)} · Harcanan {money(data?.hour?.spent)} · Kalan {money(data?.hour?.remaining)}</div>
          <div>İstek {data?.hour?.requests ?? 0} / {data?.hour?.requestLimit ?? 0}</div>
        </div>
      </div>
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
