'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsEmptyState,
  AdminOsErrorState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import type { RuleProposal } from '@/types/newsroomOs'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiLearningPage() {
  const [proposals, setProposals] = useState<RuleProposal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/proposals?kind=editorial_rule', {
        headers: await authHeaders(),
      })
      const body = (await res.json()) as { proposals?: RuleProposal[]; error?: string }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setProposals(body.proposals ?? [])
    } catch (e) {
      setProposals([])
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const seed = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ action: 'seed', kind: 'editorial_rule' }),
      })
      const body = (await res.json()) as { created?: string[]; skipped?: string[]; error?: string }
      if (!res.ok) throw new Error(body.error || 'fail')
      toast.success(
        `Öneri seed: ${(body.created ?? []).length} yeni, ${(body.skipped ?? []).length} atlandı`
      )
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Seed başarısız')
    } finally {
      setBusy(false)
    }
  }

  const createSample = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          kind: 'editorial_rule',
          title: 'Sansasyon ifadelerini kısıtla',
          summary:
            'İnsan editörler “şok / dehşet / korkunç” ifadelerini sıkça kaldırıyor. Kural güçlendirilsin (sandbox test gerekir).',
          evidence: {
            pattern: ['şok', 'dehşet', 'korkunç'],
            instructionLayer: 'global',
            instructionScopeKey: 'default',
            instructionPatch:
              'Global editorial: manşette şok/dehşet/korkunç yasak. AI production kurallarını kendi değiştirmez.',
            note: 'heuristic sample — not auto-deployed',
          },
        }),
      })
      const body = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(body.error || 'fail')
      toast.success('Learning önerisi kaydedildi')
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Oluşturulamadı')
    } finally {
      setBusy(false)
    }
  }

  const review = async (
    id: string,
    status: 'APPROVED' | 'REJECTED' | 'TESTING' | 'DEPLOYED'
  ) => {
    setBusy(true)
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ kind: 'editorial_rule', id, status }),
      })
      const body = (await res.json()) as { proposal?: RuleProposal; error?: string }
      if (!res.ok) throw new Error(body.error || 'fail')
      if (status === 'DEPLOYED') {
        const deploy = body.proposal?.evidence?.deploy as { setId?: string; version?: number } | undefined
        toast.success(
          deploy?.setId
            ? `Deployed → ${deploy.setId} v${deploy.version ?? '?'}`
            : 'DEPLOYED'
        )
      } else if (status === 'TESTING') {
        toast.success('Sandbox geçti — production henüz değişmedi')
      } else {
        toast.success(status)
      }
      void load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'İşlem başarısız')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AdminOsPageShell
      title="Öğrenme Merkezi"
      subtitle="AI production kurallarını kendi değiştirmez — öneri → sandbox → insan onayı → versioned deploy"
      actions={
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void seed()}
            className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold disabled:opacity-50"
          >
            Örnek önerileri seed et
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createSample()}
            className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            + Yeni öneri
          </button>
        </div>
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Öneri', value: loading ? '…' : String(proposals.length) },
          { label: 'PROPOSED', value: String(proposals.filter((p) => p.status === 'PROPOSED').length) },
          {
            label: 'TESTING',
            value: String(proposals.filter((p) => p.status === 'TESTING').length),
            tone: 'warn',
          },
          {
            label: 'DEPLOYED',
            value: String(proposals.filter((p) => p.status === 'DEPLOYED').length),
            tone: 'ok',
          },
        ]}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <AdminOsErrorState description={error} onRetry={() => void load()} />
      ) : proposals.length === 0 ? (
        <AdminOsEmptyState
          title="Henüz öğrenme önerisi yok"
          description="Diff/performans döngüsü bağlandıkça burada birikir. Şimdilik örnek öneri seed ederek sandbox → onay → deploy akışını deneyebilirsiniz."
        />
      ) : (
        <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {proposals.map((p) => {
            const sandbox = p.evidence?.sandbox as { status?: string; note?: string } | undefined
            const deploy = p.evidence?.deploy as { setId?: string; version?: number } | undefined
            const layer = p.evidence?.instructionLayer as string | undefined
            const scopeKey = p.evidence?.instructionScopeKey as string | undefined
            return (
              <div key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{p.title}</p>
                  <p className="text-xs text-[rgb(var(--color-muted))]">{p.summary}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-[10px] font-bold uppercase text-[rgb(var(--color-muted))]">
                    <span>{p.status}</span>
                    {layer ? <span>{layer}/{scopeKey || '—'}</span> : null}
                    {sandbox?.status ? <span className="text-sky-600">sandbox:{sandbox.status}</span> : null}
                    {deploy?.setId ? (
                      <span className="text-emerald-600">
                        {deploy.setId} v{deploy.version}
                      </span>
                    ) : null}
                  </div>
                  {sandbox?.note ? (
                    <p className="mt-1 text-[11px] text-[rgb(var(--color-muted))]">{sandbox.note}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  {p.status === 'PROPOSED' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded bg-sky-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                        onClick={() => void review(p.id, 'TESTING')}
                      >
                        Sandbox
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                        onClick={() => void review(p.id, 'REJECTED')}
                      >
                        Reddet
                      </button>
                    </>
                  ) : null}
                  {p.status === 'TESTING' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                        onClick={() => void review(p.id, 'APPROVED')}
                      >
                        Onayla
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                        onClick={() => void review(p.id, 'REJECTED')}
                      >
                        Reddet
                      </button>
                    </>
                  ) : null}
                  {p.status === 'APPROVED' || p.status === 'TESTING' ? (
                    <button
                      type="button"
                      disabled={busy}
                      className="rounded bg-violet-700 px-2 py-1 text-[10px] font-bold text-white disabled:opacity-50"
                      onClick={() => void review(p.id, 'DEPLOYED')}
                    >
                      Deploy
                    </button>
                  ) : null}
                  {p.status === 'DEPLOYED' && deploy?.setId ? (
                    <Link
                      href="/admin/ai-instructions"
                      className="rounded border border-[rgb(var(--color-border))] px-2 py-1 text-[10px] font-bold"
                    >
                      Talimatlar →
                    </Link>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </AdminOsPageShell>
  )
}
