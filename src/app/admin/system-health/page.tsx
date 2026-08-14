'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsEmptyState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'

type HealthCheck = {
  id: string
  label: string
  status: 'HEALTHY' | 'DEGRADED' | 'DOWN' | 'UNKNOWN'
  detail: string
  href?: string
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function SystemHealthPage() {
  const [checks, setChecks] = useState<HealthCheck[]>([])
  const [at, setAt] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/os-ops?resource=health', { headers: await authHeaders() })
      const body = (await res.json()) as { checks?: HealthCheck[]; at?: number; error?: string }
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setChecks(body.checks ?? [])
      setAt(body.at ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Yüklenemedi')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const healthy = checks.filter((c) => c.status === 'HEALTHY').length
  const degraded = checks.filter((c) => c.status === 'DEGRADED' || c.status === 'UNKNOWN').length
  const down = checks.filter((c) => c.status === 'DOWN').length

  return (
    <AdminOsPageShell
      title="Sistem Durumu"
      subtitle="DB · AI · Social · Queue · Cron — secret değerleri gösterilmez"
      actions={
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold"
        >
          Yeniden tara
        </button>
      }
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Sağlıklı', value: String(healthy), tone: 'ok' },
          { label: 'Uyarı', value: String(degraded), tone: 'warn' },
          { label: 'Down', value: String(down), tone: down ? 'warn' : 'default' },
          { label: 'Son tarama', value: at ? new Date(at).toLocaleTimeString('tr-TR') : '—' },
        ]}
      />
      {error ? (
        <AdminOsEmptyState title="Probe başarısız" description={error} />
      ) : (
        <div className="divide-y divide-[rgb(var(--color-border))] overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          {checks.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  c.status === 'HEALTHY' && 'bg-emerald-500',
                  c.status === 'DEGRADED' && 'bg-amber-500',
                  c.status === 'UNKNOWN' && 'bg-slate-400',
                  c.status === 'DOWN' && 'bg-red-500'
                )}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{c.label}</p>
                <p className="text-xs text-[rgb(var(--color-muted))]">{c.detail}</p>
              </div>
              <span className="text-[10px] font-bold uppercase text-[rgb(var(--color-muted))]">{c.status}</span>
              {c.href ? (
                <Link href={c.href} className="text-xs font-semibold text-[rgb(var(--color-brand))]">
                  Aç →
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-[rgb(var(--color-muted))]">
        Cron detayı için <Link className="font-semibold text-[rgb(var(--color-brand))]" href="/admin/cron">Cron İzleme</Link>
      </p>
    </AdminOsPageShell>
  )
}
