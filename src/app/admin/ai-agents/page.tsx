'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsEmptyState,
  AdminOsErrorState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

type AgentRow = {
  id: string
  displayName: string
  roleTemplateId: string
  departmentId: string
  status: string
  managerAgentId?: string | null
  territories: string[]
  autonomyLevel: number
  legacyAiEditorId?: string | null
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiAgentsPage() {
  const { can } = useCmsAuth()
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'all' | 'desk' | 'local' | 'smm' | 'writing'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const headers = await authHeaders()
      const res = await fetch('/api/admin/newsroom-agents', { headers })
      const data = (await res.json()) as { agents?: AgentRow[]; error?: string }
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setAgents(data.agents ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    return agents.filter((a) => {
      if (tab === 'all') return true
      if (tab === 'local') return a.roleTemplateId === 'local-editor'
      if (tab === 'smm') return a.roleTemplateId === 'city-smm'
      if (tab === 'writing')
        return ['fact-checker', 'quality-controller', 'legal-risk', 'seo-editor', 'visual-editor'].includes(
          a.roleTemplateId
        )
      if (tab === 'desk') return a.roleTemplateId === 'desk-editor' || a.roleTemplateId === 'news-director'
      return true
    })
  }, [agents, tab])

  const active = agents.filter((a) => a.status === 'active').length

  return (
    <AdminOsPageShell
      title="AI Ajanlar"
      subtitle="Rol · bölge · autonomy · legacy AI editör bağlantısı"
      actions={
        can('agents:manage') ? (
          <Link
            href="/admin/ai-org"
            className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-semibold text-white"
          >
            Organizasyonda yönet
          </Link>
        ) : null
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Toplam', value: String(agents.length), tone: 'ai' },
          { label: 'Aktif', value: String(active), tone: 'ok' },
          { label: 'SMM', value: String(agents.filter((a) => a.roleTemplateId === 'city-smm').length) },
          { label: 'Yerel', value: String(agents.filter((a) => a.roleTemplateId === 'local-editor').length) },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', 'Tümü'],
            ['desk', 'Masalar'],
            ['local', 'Yerel'],
            ['writing', 'Yazı İşleri'],
            ['smm', 'SMM'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-xs font-semibold',
              tab === id ? 'bg-white/15 text-white' : 'text-slate-400 hover:bg-white/5'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : error ? (
        <AdminOsErrorState description={error} onRetry={() => void load()} />
      ) : filtered.length === 0 ? (
        <AdminOsEmptyState
          title="Ajan yok"
          description="Önce AI Organizasyonu ekranından çekirdek org seed çalıştırın."
          href="/admin/ai-org"
          hrefLabel="AI Organizasyonu"
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/10">
          <table className="w-full text-left text-sm">
            <thead className="bg-white/5 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Ajan</th>
                <th className="px-4 py-3">Rol</th>
                <th className="px-4 py-3">Autonomy</th>
                <th className="px-4 py-3">Bölge</th>
                <th className="px-4 py-3">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.map((a) => (
                <tr key={a.id} className="hover:bg-white/[0.03]">
                  <td className="px-4 py-3">
                    <Link href={`/admin/ai-org`} className="font-semibold text-white hover:text-[rgb(var(--color-brand))]">
                      {a.displayName}
                    </Link>
                    {a.legacyAiEditorId ? (
                      <p className="text-[10px] text-slate-500">legacy: {a.legacyAiEditorId}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-slate-300">{a.roleTemplateId}</td>
                  <td className="px-4 py-3 tabular-nums text-slate-300">L{a.autonomyLevel}</td>
                  <td className="px-4 py-3 text-slate-400">
                    {a.territories?.length ? a.territories.join(', ') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                        a.status === 'active' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-500/20 text-slate-300'
                      )}
                    >
                      {a.status}
                    </span>
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
