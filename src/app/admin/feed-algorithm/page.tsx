'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { cmsLabel } from '@/services/cms/uiLabels'
import {
  describeWeightDelta,
  FEED_WEIGHT_META,
  sumFeedWeights,
  type FeedWeightKey,
} from '@/services/newsroomOs/feedWeightLabels'
import { DEFAULT_FEED_ALGORITHM_WEIGHTS, type FeedAlgorithmWeights, type RuleProposal } from '@/types/newsroomOs'
import toast from 'react-hot-toast'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function FeedAlgorithmPage() {
  const [config, setConfig] = useState<FeedAlgorithmWeights | null>(null)
  const [proposals, setProposals] = useState<RuleProposal[]>([])
  const [draft, setDraft] = useState<FeedAlgorithmWeights['weights'] | null>(null)
  const weights = draft ?? config?.weights ?? DEFAULT_FEED_ALGORITHM_WEIGHTS
  const sums = sumFeedWeights(weights)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/proposals?kind=algorithm_weight', {
        headers: await authHeaders(),
      })
      if (!res.ok) return
      const body = (await res.json()) as { config: FeedAlgorithmWeights; proposals: RuleProposal[] }
      setConfig(body.config)
      setProposals(body.proposals)
      setDraft(body.config.weights)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const propose = async () => {
    if (!config || !draft) return
    const delta = describeWeightDelta(config.weights, draft)
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          kind: 'algorithm_weight',
          title: 'Feed ağırlık önerisi',
          summary: delta.length
            ? delta.map((d) => `${FEED_WEIGHT_META[d.key].label} ${d.from} → ${d.to}`).join(', ')
            : 'Değişiklik yok',
          evidence: {
            weights: draft,
            current: config.weights,
            effect: delta,
            sum: sumFeedWeights(draft),
          },
        }),
      })
      if (!res.ok) throw new Error('fail')
      toast.success('Öneri kaydedildi — production değişmedi')
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
      toast.success(status === 'DEPLOYED' ? 'Yeni sürüm insan onayıyla yayınlandı' : `Durum: ${cmsLabel(status)}`)
      void load()
    } catch {
      toast.error('İnceleme başarısız')
    }
  }

  const rollback = async () => {
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'rollback', kind: 'algorithm_weight' }),
      })
      if (!res.ok) throw new Error('fail')
      toast.success('Önceki sürüme dönüldü')
      void load()
    } catch {
      toast.error('Geri alma başarısız')
    }
  }

  return (
    <AdminOsPageShell
      title="Feed & Algoritma"
      subtitle="Öneriler asla otomatik uygulanmaz. Akış: öner → incele → onayla → sürüm → geri al."
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Sürüm', value: String(config?.version ?? 1) },
          { label: 'Durum', value: cmsLabel(config?.status, 'Aktif') },
          { label: 'Skor toplamı', value: sums.score.toFixed(2) },
          { label: 'Ceza toplamı', value: sums.penalty.toFixed(2) },
        ]}
      />
      {!sums.scoreNearOne ? (
        <p className="mb-3 text-xs text-amber-700">Skor ağırlıkları toplamı 1.00 civarında olmalı (şu an {sums.score}).</p>
      ) : null}

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(FEED_WEIGHT_META) as FeedWeightKey[]).map((key) => (
          <label
            key={key}
            className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2"
            title={FEED_WEIGHT_META[key].description}
          >
            <p className="text-[11px] font-semibold text-[rgb(var(--color-text))]">{FEED_WEIGHT_META[key].label}</p>
            <p className="text-[10px] text-[rgb(var(--color-muted))]">{FEED_WEIGHT_META[key].description}</p>
            <input
              type="number"
              step="0.01"
              className="mt-1 w-full rounded border px-2 py-1 text-lg font-bold tabular-nums"
              value={weights[key]}
              onChange={(e) => setDraft({ ...weights, [key]: Number(e.target.value) })}
            />
            <p className="text-[10px] text-[rgb(var(--color-muted))]">mevcut: {config?.weights[key] ?? DEFAULT_FEED_ALGORITHM_WEIGHTS[key]}</p>
          </label>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" onClick={() => void propose()} className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white">
          Öneri oluştur
        </button>
        <button type="button" onClick={() => void rollback()} className="rounded-lg border px-3 py-2 text-xs font-semibold">
          Önceki sürüme dön
        </button>
      </div>

      <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        {proposals.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[rgb(var(--color-muted))]">Henüz algoritma önerisi yok.</p>
        ) : (
          proposals.map((p) => {
            const evidence = (p.evidence || {}) as {
              current?: FeedAlgorithmWeights['weights']
              weights?: FeedAlgorithmWeights['weights']
              effect?: Array<{ key: FeedWeightKey; from: number; to: number }>
            }
            return (
              <div key={p.id} className="px-4 py-3">
                <p className="text-sm font-semibold">{p.title}</p>
                <p className="text-xs text-[rgb(var(--color-muted))]">{p.summary}</p>
                <p className="mt-1 text-[10px] font-bold uppercase">{cmsLabel(p.status)}</p>
                {evidence.effect?.length ? (
                  <ul className="mt-2 text-xs">
                    {evidence.effect.map((row) => (
                      <li key={row.key}>
                        {FEED_WEIGHT_META[row.key]?.label || row.key}: {row.from} → {row.to}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {p.status === 'PROPOSED' || p.status === 'TESTING' ? (
                  <div className="mt-2 flex gap-1">
                    <button type="button" className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white" onClick={() => void review(p.id, 'APPROVED')}>
                      Onayla
                    </button>
                    <button type="button" className="rounded bg-slate-700 px-2 py-1 text-[10px] font-bold text-white" onClick={() => void review(p.id, 'DEPLOYED')}>
                      Sürüm yayınla
                    </button>
                    <button type="button" className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white" onClick={() => void review(p.id, 'REJECTED')}>
                      Reddet
                    </button>
                  </div>
                ) : null}
              </div>
            )
          })
        )}
      </div>
    </AdminOsPageShell>
  )
}
