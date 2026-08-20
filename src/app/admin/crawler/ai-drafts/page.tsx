'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

type JobRow = {
  clusterId: string
  eventKey: string | null
  status: string
  provider: string | null
  model: string | null
  estimatedCostUsd: number | null
  actualCostUsd: number | null
  createdAt: string | Date
  startedAt: string | Date | null
  completedAt: string | Date | null
  failure: string | null
}

/**
 * AI_DRAFT editor queue — Phase 4D.
 * Manual publish only; no crawler auto-publish.
 */
export default function AiDraftsPage() {
  const [jobs, setJobs] = useState<JobRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/crawler/ai-dispatch', { headers: await authHeaders() })
    const body = (await res.json()) as {
      jobs?: JobRow[]
      completed?: JobRow[]
      dataUnavailable?: boolean
      alert?: string | null
      error?: string
    }
    if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
    if (body.dataUnavailable) {
      setUnavailable(true)
      setError(body.alert || 'Veri kaynağına ulaşılamıyor')
      setJobs([])
      return
    }
    setUnavailable(false)
    const completed = (body.jobs || []).filter((j) => j.status === 'COMPLETED')
    setJobs(completed)
  }, [])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'))
  }, [load])

  return (
    <AdminOsPageShell
      title="AI Taslakları"
      subtitle="AI_DRAFT kuyruğu. Yayın için manuel onay gerekir. Otomatik yayın yok."
    >
      <CrawlerSubnav />
      {error ? (
        <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {unavailable ? 'Veri kaynağına ulaşılamıyor' : error}
        </p>
      ) : null}
      <p className="mb-4 text-sm text-[rgb(var(--color-muted))]">
        Aksiyonlar: Önizle · Düzenle · Yayınla · Reddet — hepsi CMS izinleri ve audit ile. Yeniden
        hazırlama ücretli ve açıkça tetiklenir.
      </p>
      {jobs.length === 0 && !unavailable ? (
        <p className="text-sm text-[rgb(var(--color-muted))]">AI_DRAFT kaydı yok (Stage 1: harcama kapalı).</p>
      ) : (
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              <th className="px-2 py-1">Olay</th>
              <th className="px-2 py-1">Durum</th>
              <th className="px-2 py-1">Provider</th>
              <th className="px-2 py-1">Model</th>
              <th className="px-2 py-1">Tahmini</th>
              <th className="px-2 py-1">Gerçek</th>
              <th className="px-2 py-1">Oluşturulma</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={`${j.clusterId}-${String(j.createdAt)}`} className="border-t border-[rgb(var(--color-border))]">
                <td className="px-2 py-1">
                  <Link className="underline" href={`/admin/crawler/clusters/${j.clusterId}`}>
                    {j.eventKey || j.clusterId}
                  </Link>
                </td>
                <td className="px-2 py-1">{j.status}</td>
                <td className="px-2 py-1">{j.provider || '—'}</td>
                <td className="px-2 py-1">{j.model || '—'}</td>
                <td className="px-2 py-1">
                  {j.estimatedCostUsd == null ? '—' : `$${j.estimatedCostUsd.toFixed(4)}`}
                </td>
                <td className="px-2 py-1">
                  {j.actualCostUsd == null ? '—' : `$${j.actualCostUsd.toFixed(4)}`}
                </td>
                <td className="px-2 py-1">{new Date(j.createdAt).toLocaleString('tr-TR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </AdminOsPageShell>
  )
}
