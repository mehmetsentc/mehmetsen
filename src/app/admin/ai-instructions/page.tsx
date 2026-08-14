'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { cn } from '@/lib/utils'

type Layer = { id: string; label: string; status: string }

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiInstructionsPage() {
  const [layers, setLayers] = useState<Layer[]>([])
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/os-ops?resource=instructions', { headers: await authHeaders() })
      const body = (await res.json()) as { layers?: Layer[]; note?: string }
      if (res.ok) {
        setLayers(body.layers ?? [])
        setNote(body.note ?? '')
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AdminOsPageShell
      title="AI Talimatlar"
      subtitle="Global → department → role → location → agent → task/news"
    >
      <AdminOsMetricGrid
        items={[
          { label: 'Katman', value: String(layers.length || 7) },
          { label: 'Aktif', value: String(layers.filter((l) => l.status === 'active').length), tone: 'ok' },
          { label: 'Runtime', value: String(layers.filter((l) => l.status === 'runtime').length), tone: 'ai' },
          { label: 'Effective', value: 'Server-side' },
        ]}
      />

      <div className="space-y-2">
        {layers.map((l, i) => (
          <div
            key={l.id}
            className="flex items-center gap-3 rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-violet-500/15 text-xs font-bold text-violet-700">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{l.label}</p>
              <p className="admin-meta">{l.id}</p>
            </div>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                l.status === 'active' && 'bg-emerald-500/15 text-emerald-700',
                l.status === 'ready' && 'bg-sky-500/15 text-sky-700',
                l.status === 'runtime' && 'bg-violet-500/15 text-violet-700'
              )}
            >
              {l.status}
            </span>
          </div>
        ))}
      </div>

      {note ? <p className="text-sm text-[rgb(var(--color-muted))]">{note}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/ai-editors"
          className="rounded-lg bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white"
        >
          AI Editör promptları
        </Link>
        <Link
          href="/admin/ai-agents"
          className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold"
        >
          Ajan custom instructions
        </Link>
        <Link
          href="/admin/ai-org"
          className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold"
        >
          Org runtime context
        </Link>
      </div>
    </AdminOsPageShell>
  )
}
