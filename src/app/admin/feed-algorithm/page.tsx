'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { auth } from '@/lib/firebase/auth'
import {
  defaultFeedAlgorithmOps,
  normalizeBoostTopic,
  type FeedAlgorithmOps,
} from '@/lib/feed/feedAlgorithmOps'
import { cmsLabel } from '@/services/cms/uiLabels'
import {
  describeWeightDelta,
  FEED_WEIGHT_META,
  sumFeedWeights,
  type FeedWeightKey,
} from '@/services/newsroomOs/feedWeightLabels'
import { DEFAULT_FEED_ALGORITHM_WEIGHTS, type FeedAlgorithmWeights, type RuleProposal } from '@/types/newsroomOs'
import { loadAdminJson } from '@/lib/adminApiError'
import { cn } from '@/lib/utils'
import toast from 'react-hot-toast'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function FeedAlgorithmPage() {
  const { can } = useCmsAuth()
  const canManage = can('algorithm:manage')

  const [ops, setOps] = useState<FeedAlgorithmOps>(defaultFeedAlgorithmOps())
  const [persisted, setPersisted] = useState(false)
  const [envLive, setEnvLive] = useState(false)
  const [topicDraft, setTopicDraft] = useState('')
  const [opsError, setOpsError] = useState<string | null>(null)
  const [opsSaving, setOpsSaving] = useState(false)

  const [config, setConfig] = useState<FeedAlgorithmWeights | null>(null)
  const [proposals, setProposals] = useState<RuleProposal[]>([])
  const [draft, setDraft] = useState<FeedAlgorithmWeights['weights'] | null>(null)
  const weights = draft ?? config?.weights ?? DEFAULT_FEED_ALGORITHM_WEIGHTS
  const sums = sumFeedWeights(weights)
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadOps = useCallback(async () => {
    const result = await loadAdminJson<{
      ops: FeedAlgorithmOps
      persisted: boolean
      envLive: boolean
    }>('/api/admin/feed-algorithm/ops', { headers: await authHeaders() })
    if (!result.ok) {
      setOpsError(result.error)
      return
    }
    setOpsError(null)
    setOps(result.data.ops)
    setPersisted(result.data.persisted)
    setEnvLive(Boolean(result.data.envLive))
  }, [])

  const load = useCallback(async () => {
    const result = await loadAdminJson<{ config: FeedAlgorithmWeights; proposals: RuleProposal[] }>(
      '/api/admin/proposals?kind=algorithm_weight',
      { headers: await authHeaders() }
    )
    if (!result.ok) {
      setLoadError(result.error)
      return
    }
    setLoadError(null)
    setConfig(result.data.config)
    setProposals(result.data.proposals)
    setDraft(result.data.config.weights)
  }, [])

  useEffect(() => {
    void loadOps()
    void load()
  }, [loadOps, load])

  const saveOps = async (next: FeedAlgorithmOps, toastMsg?: string) => {
    if (!canManage) return
    setOpsSaving(true)
    try {
      const res = await fetch('/api/admin/feed-algorithm/ops', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(next),
      })
      const body = (await res.json()) as { ops?: FeedAlgorithmOps; error?: string; persisted?: boolean }
      if (!res.ok || !body.ops) throw new Error(body.error || 'fail')
      setOps(body.ops)
      setPersisted(true)
      toast.success(toastMsg || 'Algoritma ayarları kaydedildi')
    } catch {
      toast.error('Kaydedilemedi')
    } finally {
      setOpsSaving(false)
    }
  }

  const toggleLive = (next: boolean) => {
    const updated = { ...ops, liveEnabled: next }
    setOps(updated)
    void saveOps(updated, next ? 'Algoritma açıldı — Feed 2 NFRank canlı' : 'Algoritma kapatıldı — Feed 2 gölge/V1')
  }

  const addTopic = () => {
    const n = normalizeBoostTopic(topicDraft)
    if (!n) {
      toast.error('Konu en az 2 karakter olmalı')
      return
    }
    if (ops.boostTopics.includes(n)) {
      setTopicDraft('')
      return
    }
    setOps({ ...ops, boostTopics: [...ops.boostTopics, n] })
    setTopicDraft('')
  }

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
      title="Algoritma Yönetimi"
      subtitle="Feed 2 sıralamasını aç/kapa, talimat yaz, öne çıkarılacak konuları belirle. Deploy gerekmez."
    >
      {opsError ? <p className="mb-3 text-sm text-red-600" role="alert">{opsError}</p> : null}

      <AdminOsMetricGrid
        items={[
          { label: 'NFRank', value: ops.liveEnabled ? 'Açık' : 'Kapalı' },
          { label: 'Kayıt', value: persisted ? 'Admin' : 'Ortam varsayılanı' },
          { label: 'Öne çıkan konu', value: String(ops.boostTopics.length) },
          { label: 'Env yedek', value: envLive ? 'açık' : 'kapalı' },
        ]}
      />

      <section className="mb-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-[rgb(var(--color-text))]">Algoritma işlemi</h2>
            <p className="mt-1 max-w-xl text-xs text-[rgb(var(--color-muted))]">
              Açıkken Feed 2 herkese NFRank sırası verir. Kapalıyken görünür sıra V1’e döner; gölge ölçüm devam edebilir.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={ops.liveEnabled}
            disabled={!canManage || opsSaving}
            onClick={() => toggleLive(!ops.liveEnabled)}
            className={cn(
              'relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-50',
              ops.liveEnabled ? 'bg-emerald-600' : 'bg-slate-300'
            )}
          >
            <span
              className={cn(
                'absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-transform',
                ops.liveEnabled ? 'left-7' : 'left-1'
              )}
            />
          </button>
        </div>
      </section>

      <section className="mb-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <h2 className="text-sm font-semibold text-[rgb(var(--color-text))]">Talimatlar</h2>
        <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
          Sıralama ekibine ve operasyona not: hangi olaylar, ton, kaçınılacak başlıklar.
        </p>
        <textarea
          className="mt-3 min-h-28 w-full rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-2 text-sm"
          value={ops.instructions}
          disabled={!canManage}
          placeholder="Örn. Seçim gecesi breaking’i bozma. Magazin keşfini kıs. Yerel yangın/afet haberlerini öne çıkar."
          onChange={(e) => setOps({ ...ops, instructions: e.target.value })}
        />
      </section>

      <section className="mb-4 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
        <h2 className="text-sm font-semibold text-[rgb(var(--color-text))]">Öne çıkarılacak konular</h2>
        <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">
          Kategori, etiket veya başlıkta geçen kelimeler Feed 2’de sınırlı yükseltilir. Ağırlık formülü değişmez.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {ops.boostTopics.length === 0 ? (
            <p className="text-xs text-[rgb(var(--color-muted))]">Henüz konu yok.</p>
          ) : (
            ops.boostTopics.map((topic) => (
              <button
                key={topic}
                type="button"
                disabled={!canManage}
                onClick={() => setOps({ ...ops, boostTopics: ops.boostTopics.filter((t) => t !== topic) })}
                className="rounded-full border border-[rgb(var(--color-border))] bg-[rgb(var(--color-bg))] px-3 py-1 text-xs font-semibold disabled:opacity-60"
              >
                {topic} ×
              </button>
            ))
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="min-w-[12rem] flex-1 rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-sm"
            value={topicDraft}
            disabled={!canManage}
            placeholder="ekonomi, deprem, Euro 2028…"
            onChange={(e) => setTopicDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addTopic()
              }
            }}
          />
          <button
            type="button"
            disabled={!canManage}
            onClick={addTopic}
            className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            Konu ekle
          </button>
        </div>
        <div className="mt-4">
          <button
            type="button"
            disabled={!canManage || opsSaving}
            onClick={() => void saveOps(ops)}
            className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            Talimat ve konuları kaydet
          </button>
        </div>
      </section>

      <details className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          İleri: ağırlık önerileri
        </summary>
        <div className="border-t border-[rgb(var(--color-border))] px-4 py-4">
          {loadError ? <p className="mb-3 text-sm text-red-600" role="alert">{loadError}</p> : null}
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
        </div>
      </details>
    </AdminOsPageShell>
  )
}
