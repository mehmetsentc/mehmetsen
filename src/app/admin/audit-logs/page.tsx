'use client'

import { useCallback, useEffect, useState } from 'react'
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

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/os-ops?resource=audit', { headers: await authHeaders() })
      const body = (await res.json()) as { logs?: AuditLogEntry[]; error?: string }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setLogs(body.logs ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AdminOsPageShell title="Audit Loglar" subtitle="HUMAN / AI / SYSTEM — kritik mutasyonlar">
      <AdminOsMetricGrid
        items={[
          { label: 'Kayıt', value: loading ? '…' : String(logs.length) },
          { label: 'AI', value: String(logs.filter((l) => l.actorType === 'AI').length), tone: 'ai' },
          { label: 'İnsan', value: String(logs.filter((l) => l.actorType === 'HUMAN').length) },
          { label: 'Sistem', value: String(logs.filter((l) => l.actorType === 'SYSTEM').length) },
        ]}
      />
      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center">
          <p className="font-semibold text-red-700">Yüklenemedi</p>
          <p className="mt-1 text-sm text-[rgb(var(--color-muted))]">{error}</p>
          <button type="button" onClick={() => void load()} className="mt-3 text-xs font-semibold text-[rgb(var(--color-brand))]">
            Yeniden dene
          </button>
        </div>
      ) : logs.length === 0 && !loading ? (
        <AdminOsEmptyState
          title="Henüz audit kaydı yok"
          description="Agent task oluşturma / status değişiklikleri burada birikir. AI Görevler’den örnek task açabilirsiniz."
          href="/admin/ai-tasks"
          hrefLabel="AI Görevler"
        />
      ) : (
        <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {logs.map((l) => (
            <div key={l.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
              <span className="text-sm" aria-hidden>
                {l.actorType === 'AI' ? '🤖' : l.actorType === 'HUMAN' ? '👤' : '⚙'}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
                  {l.action} · {l.entityType}
                </p>
                <p className="text-xs text-[rgb(var(--color-muted))]">
                  {l.actorLabel} · {l.entityId}
                  {l.newsId ? ` · news ${l.newsId}` : ''}
                </p>
              </div>
              <span className="text-[10px] tabular-nums text-[rgb(var(--color-muted))]">
                {l.createdAt ? format(new Date(l.createdAt), 'dd.MM HH:mm') : ''}
              </span>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={() => void load()} className="text-xs font-semibold text-[rgb(var(--color-brand))]">
        Yenile
      </button>
    </AdminOsPageShell>
  )
}
