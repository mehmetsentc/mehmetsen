'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AdminOsEmptyState,
  AdminOsErrorState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import type { AgentTask } from '@/types/newsroomOs'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiTasksPage() {
  const { can } = useCmsAuth()
  const [tasks, setTasks] = useState<AgentTask[]>([])
  const [counts, setCounts] = useState({
    pending: 0,
    processing: 0,
    needsHuman: 0,
    failed: 0,
    completed: 0,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/agent-tasks', { headers })
      const data = (await res.json()) as {
        tasks?: AgentTask[]
        counts?: typeof counts
        error?: string
      }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setTasks(data.tasks ?? [])
      if (data.counts) setCounts(data.counts)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const createSampleFactCheck = async () => {
    if (!can('agents:delegate') && !can('agents:manage') && !can('ai:use')) {
      toast.error('Yetkiniz yok')
      return
    }
    setCreating(true)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/agent-tasks', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'FACT_CHECK',
          assignedAgentId: 'agent-fact-check',
          priority: 'high',
          input: {
            note: 'Manuel test görevi — haber iddiasını doğrula',
            claims: ['Örnek iddia: olay tarihi doğrulanacak'],
          },
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error || 'Oluşturulamadı')
      toast.success('Fact Check görevi oluşturuldu')
      await load()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Hata')
    } finally {
      setCreating(false)
    }
  }

  const markNeedsHuman = async (taskId: string) => {
    const headers = await authHeaders()
    const res = await fetch('/api/admin/agent-tasks', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'update-status', taskId, status: 'NEEDS_HUMAN' }),
    })
    if (!res.ok) {
      toast.error('Güncellenemedi')
      return
    }
    toast.success('İnsana yönlendirildi')
    await load()
  }

  return (
    <AdminOsPageShell
      title="AI Görevler"
      subtitle="Ajanlar arası task bus — audit log’lu"
      actions={
        <button
          type="button"
          disabled={creating}
          onClick={() => void createSampleFactCheck()}
          className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '+ Fact Check Görevi'}
        </button>
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Pending', value: String(counts.pending), tone: 'warn' },
          { label: 'Processing', value: String(counts.processing) },
          { label: 'Needs human', value: String(counts.needsHuman), tone: 'warn' },
          { label: 'Failed', value: String(counts.failed) },
          { label: 'Completed', value: String(counts.completed), tone: 'ok' },
        ]}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <AdminOsErrorState description={error} onRetry={() => void load()} />
      ) : tasks.length === 0 ? (
        <AdminOsEmptyState
          title="Açık görev yok"
          description="Pipeline aşamaları ve masa editörleri görev ürettikçe burada listelenir. Şimdilik manuel Fact Check görevi oluşturabilirsiniz."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Tip</th>
                <th className="px-4 py-3">Atanan</th>
                <th className="px-4 py-3">Öncelik</th>
                <th className="px-4 py-3">Durum</th>
                <th className="px-4 py-3">Haber</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tasks.map((t) => (
                <tr key={t.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3 font-semibold text-white">{t.type}</td>
                  <td className="px-4 py-3 text-slate-300">{t.assignedAgentId ?? t.assignedHumanId ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-400">{t.priority}</td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        t.status === 'COMPLETED' && 'bg-emerald-500/15 text-emerald-300',
                        t.status === 'FAILED' && 'bg-red-500/15 text-red-300',
                        t.status === 'NEEDS_HUMAN' && 'bg-amber-500/15 text-amber-300',
                        t.status === 'PENDING' && 'bg-slate-500/20 text-slate-300',
                        t.status === 'PROCESSING' && 'bg-blue-500/15 text-blue-300'
                      )}
                    >
                      {t.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{t.newsId ?? '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {t.status === 'PENDING' || t.status === 'PROCESSING' ? (
                      <button
                        type="button"
                        onClick={() => void markNeedsHuman(t.id)}
                        className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
                      >
                        İnsana ver
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminOsPageShell>
  )
}
