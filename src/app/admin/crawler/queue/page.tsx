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

interface Row {
  id: string
  canonicalTitle: string | null
  aiEligibility: string
  aiEligibilityReason: string | null
  uniqueSourceCount: number
  articleCount: number
  importanceScore: number
  freshnessScore: number
  ageMinutes: number
}

export default function PreAiQueuePage() {
  const [rows, setRows] = useState<Row[]>([])
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const q = filter ? `?eligibility=${filter}` : ''
    const res = await fetch(`/api/admin/crawler/queue${q}`, { headers: await authHeaders() })
    const body = await res.json()
    if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
    setRows((body.clusters || []) as Row[])
  }, [filter])

  useEffect(() => {
    void load().catch((err) => setError(err instanceof Error ? err.message : 'Yüklenemedi'))
  }, [load])

  return (
    <AdminOsPageShell title="Pre-AI Event Queue" subtitle="WATCHING / ELIGIBLE / HIGH_PRIORITY / REJECTED. Dispatch yok.">
      <CrawlerSubnav />
      <div className="mb-3 flex gap-2 text-sm">
        {['', 'WATCHING', 'ELIGIBLE', 'HIGH_PRIORITY', 'REJECTED'].map((v) => (
          <button
            key={v || 'all'}
            type="button"
            onClick={() => setFilter(v)}
            className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-1"
          >
            {v || 'all'}
          </button>
        ))}
      </div>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1">Event</th>
            <th className="px-2 py-1">Gate</th>
            <th className="px-2 py-1">Src</th>
            <th className="px-2 py-1">Arts</th>
            <th className="px-2 py-1">Imp</th>
            <th className="px-2 py-1">Age</th>
            <th className="px-2 py-1">Reason</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-[rgb(var(--color-border))]">
              <td className="px-2 py-1">
                <Link className="underline" href={`/admin/crawler/clusters/${r.id}`}>
                  {r.canonicalTitle || r.id}
                </Link>
              </td>
              <td className="px-2 py-1">{r.aiEligibility}</td>
              <td className="px-2 py-1">{r.uniqueSourceCount}</td>
              <td className="px-2 py-1">{r.articleCount}</td>
              <td className="px-2 py-1">{r.importanceScore}</td>
              <td className="px-2 py-1">{r.ageMinutes}m</td>
              <td className="px-2 py-1">{r.aiEligibilityReason}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminOsPageShell>
  )
}
