'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import {
  AdminOsEmptyState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import type { AuditLogEntry } from '@/types/newsroomOs'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/os-ops?resource=audit', { headers: await authHeaders() })
      const body = (await res.json()) as { logs?: AuditLogEntry[] }
      if (!res.ok) throw new Error('fail')
      setLogs((body.logs ?? []).filter((l) => l.actorType === 'AI' || l.action.startsWith('agent_')))
    } catch {
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AdminOsPageShell title="AI Logları" subtitle="Agent execution / task audit (secrets hariç)">
      <AdminOsMetricGrid
        items={[
          { label: 'AI kayıt', value: loading ? '…' : String(logs.length), tone: 'ai' },
          { label: 'Task create', value: String(logs.filter((l) => l.action.includes('create')).length) },
          { label: 'Status', value: String(logs.filter((l) => l.action.includes('status')).length) },
          { label: 'Kaynak', value: 'cmsAuditLogs' },
        ]}
      />
      {logs.length === 0 && !loading ? (
        <AdminOsEmptyState
          title="AI log yok"
          description="Pipeline veya AI Görevler task ürettiğinde agent_task.* audit satırları burada listelenir."
          href="/admin/ai-tasks"
          hrefLabel="AI Görevler"
        />
      ) : (
        <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {logs.map((l) => (
            <div key={l.id} className="flex gap-3 px-4 py-3">
              <span aria-hidden>🤖</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{l.action}</p>
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  {l.actorLabel} · {l.entityId}
                  {l.agentTaskId ? ` · task ${l.agentTaskId}` : ''}
                </p>
              </div>
              <span className="text-[10px] tabular-nums text-[rgb(var(--color-muted))]">
                {l.createdAt ? format(new Date(l.createdAt), 'dd.MM HH:mm') : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      <Link href="/admin/audit-logs" className="text-xs font-semibold text-[rgb(var(--color-brand))]">
        Tüm audit →
      </Link>
    </AdminOsPageShell>
  )
}
