'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'

type ModelRow = { id: string; label: string; role: string; status: string }

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiModelsPage() {
  const [models, setModels] = useState<ModelRow[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/os-ops?resource=models', { headers: await authHeaders() })
      const body = (await res.json()) as { models?: ModelRow[] }
      if (res.ok) setModels(body.models ?? [])
    } catch {
      setModels([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const configured = models.filter((m) => m.status === 'configured').length

  return (
    <AdminOsPageShell
      title="AI Modelleri"
      subtitle="Provider abstraction — API key değerleri client’a gönderilmez"
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Provider', value: String(models.length || '—') },
          { label: 'Yapılandırılmış', value: String(configured), tone: 'ok' },
          { label: 'Eksik', value: String(Math.max(0, models.length - configured)), tone: 'warn' },
          { label: 'Primary', value: 'DeepSeek' },
        ]}
      />
      <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-[rgb(var(--color-border))] text-[11px] uppercase text-[rgb(var(--color-muted))]">
              <th className="px-4 py-3">Provider</th>
              <th className="px-4 py-3">Rol</th>
              <th className="px-4 py-3">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[rgb(var(--color-border))]">
            {models.map((m) => (
              <tr key={m.id}>
                <td className="px-4 py-3 font-semibold">{m.label}</td>
                <td className="px-4 py-3 admin-meta">{m.role}</td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                      m.status === 'configured'
                        ? 'bg-emerald-500/15 text-emerald-700'
                        : 'bg-amber-500/15 text-amber-700'
                    )}
                  >
                    {m.status === 'configured' ? 'Hazır' : 'Env eksik'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-[rgb(var(--color-muted))]">
        Agent bazlı primary/fallback model ataması AI Ajanlar ekranından yönetilir. Secret’lar yalnızca server env’de tutulur.
      </p>
    </AdminOsPageShell>
  )
}
