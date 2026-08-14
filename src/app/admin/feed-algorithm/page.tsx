'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { DEFAULT_FEED_ALGORITHM_WEIGHTS, type FeedAlgorithmWeights, type RuleProposal } from '@/types/newsroomOs'
import toast from 'react-hot-toast'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function FeedAlgorithmPage() {
  const [config, setConfig] = useState<FeedAlgorithmWeights | null>(null)
  const [proposals, setProposals] = useState<RuleProposal[]>([])
  const weights = config?.weights ?? DEFAULT_FEED_ALGORITHM_WEIGHTS

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/proposals?kind=algorithm_weight', {
        headers: await authHeaders(),
      })
      if (!res.ok) return
      const body = (await res.json()) as { config: FeedAlgorithmWeights; proposals: RuleProposal[] }
      setConfig(body.config)
      setProposals(body.proposals)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const proposeBump = async () => {
    try {
      const next = { ...weights, locationAffinity: Math.min(0.4, Number((weights.locationAffinity + 0.02).toFixed(2))) }
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          kind: 'algorithm_weight',
          title: 'locationAffinity küçük artış önerisi',
          summary: `locationAffinity ${weights.locationAffinity} → ${next.locationAffinity}`,
          evidence: { weights: next },
        }),
      })
      if (!res.ok) throw new Error('fail')
      toast.success('Öneri oluşturuldu (production değişmedi)')
      void load()
    } catch {
      toast.error('Öneri oluşturulamadı')
    }
  }

  const review = async (id: string, status: 'APPROVED' | 'REJECTED' | 'DEPLOYED') => {
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ kind: 'algorithm_weight', id, status }),
      })
      if (!res.ok) throw new Error('fail')
      toast.success(`Durum: ${status}`)
      void load()
    } catch {
      toast.error('İnceleme başarısız')
    }
  }

  return (
    <AdminOsPageShell
      title="Feed & Algoritma"
      subtitle="Ağırlıklar görünür; Algorithm Agent yalnızca öneri üretir — deploy insan onayı ister"
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Config', value: config?.id ?? 'default' },
          { label: 'Sürüm', value: String(config?.version ?? 1) },
          { label: 'Öneri', value: String(proposals.length) },
          { label: 'Durum', value: config?.status ?? 'active' },
        ]}
      />

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(weights).map(([k, v]) => (
          <div
            key={k}
            className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2"
          >
            <p className="text-[11px] text-[rgb(var(--color-muted))]">{k}</p>
            <p className="text-lg font-bold tabular-nums">{v}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void proposeBump()}
        className="mb-4 rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white"
      >
        Örnek öneri oluştur (simüle değil — kayıt)
      </button>

      <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        {proposals.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[rgb(var(--color-muted))]">Henüz algoritma önerisi yok.</p>
        ) : (
          proposals.map((p) => (
            <div key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{p.title}</p>
                <p className="text-xs text-[rgb(var(--color-muted))]">{p.summary}</p>
                <p className="mt-1 text-[10px] font-bold uppercase text-[rgb(var(--color-muted))]">{p.status}</p>
              </div>
              {p.status === 'PROPOSED' || p.status === 'TESTING' ? (
                <div className="flex gap-1">
                  <button type="button" className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white" onClick={() => void review(p.id, 'APPROVED')}>
                    Onayla
                  </button>
                  <button type="button" className="rounded bg-slate-700 px-2 py-1 text-[10px] font-bold text-white" onClick={() => void review(p.id, 'DEPLOYED')}>
                    Deploy
                  </button>
                  <button type="button" className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white" onClick={() => void review(p.id, 'REJECTED')}>
                    Reddet
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </AdminOsPageShell>
  )
}
