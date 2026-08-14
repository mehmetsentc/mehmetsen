'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import {
  AdminOsEmptyState,
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import type { AgentTask } from '@/types/newsroomOs'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function AiPerformancePage() {
  const [totals, setTotals] = useState<{
    tasks: number
    completed: number
    failed: number
    needsHuman: number
    successRate: number | null
  } | null>(null)
  const [byType, setByType] = useState<Record<string, number>>({})
  const [recent, setRecent] = useState<AgentTask[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/os-ops?resource=ai-performance', { headers: await authHeaders() })
      const body = (await res.json()) as {
        totals?: typeof totals
        byType?: Record<string, number>
        recent?: AgentTask[]
      }
      if (!res.ok) return
      setTotals(body.totals ?? null)
      setByType(body.byType ?? {})
      setRecent(body.recent ?? [])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AdminOsPageShell title="AI Performans" subtitle="Latency/cost uydurma skor yok — task bus metrikleri">
      <AdminOsMetricGrid
        items={[
          { label: 'Görev', value: String(totals?.tasks ?? 0) },
          { label: 'Tamamlanan', value: String(totals?.completed ?? 0), tone: 'ok' },
          { label: 'Başarısız', value: String(totals?.failed ?? 0), tone: 'warn' },
          {
            label: 'Başarı %',
            value: totals?.successRate == null ? '—' : String(totals.successRate),
            tone: 'ai',
          },
          { label: 'İnsan lazım', value: String(totals?.needsHuman ?? 0) },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          <h2 className="admin-section-title mb-3">Tip dağılımı</h2>
          {Object.keys(byType).length === 0 ? (
            <p className="text-sm text-[rgb(var(--color-muted))]">Henüz task yok.</p>
          ) : (
            <ul className="space-y-2">
              {Object.entries(byType).map(([k, v]) => (
                <li key={k} className="flex justify-between text-sm">
                  <span>{k}</span>
                  <span className="font-bold tabular-nums">{v}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="admin-section-title">Son görevler</h2>
            <Link href="/admin/ai-tasks" className="text-xs font-semibold text-[rgb(var(--color-brand))]">
              Tümü →
            </Link>
          </div>
          {recent.length === 0 ? (
            <AdminOsEmptyState title="Veri yok" description="Pipeline veya AI Görevler task ürettiğinde dolar." />
          ) : (
            <ul className="space-y-2">
              {recent.slice(0, 8).map((t) => (
                <li key={t.id} className="flex justify-between gap-2 text-xs">
                  <span className="truncate font-medium">
                    {t.type} · {t.assignedAgentId || '—'}
                  </span>
                  <span className="shrink-0 font-bold">{t.status}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </AdminOsPageShell>
  )
}
