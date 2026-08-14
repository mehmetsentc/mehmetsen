'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import type { RuleProposal } from '@/types/newsroomOs'
import toast from 'react-hot-toast'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiLearningPage() {
  const [proposals, setProposals] = useState<RuleProposal[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/proposals?kind=editorial_rule', {
        headers: await authHeaders(),
      })
      if (!res.ok) return
      const body = (await res.json()) as { proposals: RuleProposal[] }
      setProposals(body.proposals)
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createSample = async () => {
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({
          kind: 'editorial_rule',
          title: 'Sansasyon ifadelerini kısıtla',
          summary:
            'İnsan editörler “şok / dehşet / korkunç” ifadelerini sıkça kaldırıyor. Kural güçlendirilsin (sandbox test gerekir).',
          evidence: { pattern: ['şok', 'dehşet', 'korkunç'], note: 'heuristic sample — not auto-deployed' },
        }),
      })
      if (!res.ok) throw new Error('fail')
      toast.success('Learning önerisi kaydedildi')
      void load()
    } catch {
      toast.error('Oluşturulamadı')
    }
  }

  const review = async (id: string, status: 'APPROVED' | 'REJECTED' | 'TESTING') => {
    try {
      const res = await fetch('/api/admin/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ kind: 'editorial_rule', id, status }),
      })
      if (!res.ok) throw new Error('fail')
      toast.success(status)
      void load()
    } catch {
      toast.error('İşlem başarısız')
    }
  }

  return (
    <AdminOsPageShell
      title="Öğrenme Merkezi"
      subtitle="AI production kurallarını kendi değiştirmez — öneri → sandbox → insan onayı → versioned deploy"
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Öneri', value: String(proposals.length) },
          { label: 'PROPOSED', value: String(proposals.filter((p) => p.status === 'PROPOSED').length) },
          { label: 'TESTING', value: String(proposals.filter((p) => p.status === 'TESTING').length) },
          { label: 'DEPLOYED', value: String(proposals.filter((p) => p.status === 'DEPLOYED').length) },
        ]}
      />

      <button
        type="button"
        onClick={() => void createSample()}
        className="mb-4 rounded-lg bg-violet-600 px-3 py-2 text-xs font-bold text-white"
      >
        Örnek learning önerisi
      </button>

      <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        {proposals.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[rgb(var(--color-muted))]">
            Henüz öğrenme önerisi yok. Diff/performans döngüsü bağlandıkça burada birikir.
          </p>
        ) : (
          proposals.map((p) => (
            <div key={p.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{p.title}</p>
                <p className="text-xs text-[rgb(var(--color-muted))]">{p.summary}</p>
                <p className="mt-1 text-[10px] font-bold uppercase">{p.status}</p>
              </div>
              {p.status === 'PROPOSED' ? (
                <div className="flex gap-1">
                  <button type="button" className="rounded bg-sky-600 px-2 py-1 text-[10px] font-bold text-white" onClick={() => void review(p.id, 'TESTING')}>
                    Sandbox
                  </button>
                  <button type="button" className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-bold text-white" onClick={() => void review(p.id, 'APPROVED')}>
                    Onayla
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
