'use client'

import { useEffect, useState } from 'react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

interface Row {
  name: string
  status: string
  healthScore: number
  lastSuccessfulDiscoveryAt: string | null
  lastSuccessfulExtractionAt: string | null
  consecutiveFailures: number
  extractionSuccessRate: number | null
  averageConfidence: number
}

export default function CrawlerHealthPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [http429, setHttp429] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const res = await fetch('/api/admin/crawler/health', { headers: await authHeaders() })
      const body = await res.json()
      if (!res.ok) setError(body.error || 'Yüklenemedi')
      else {
        setRows((body.sources || []) as Row[])
        setHttp429(Number(body.http429 || 0))
      }
    })()
  }, [])

  return (
    <AdminOsPageShell title="Crawler Health" subtitle="Source health, 429s, extraction rates">
      <CrawlerSubnav />
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <p className="mb-3 text-sm">HTTP 429 count (today): {http429}</p>
      <table className="min-w-full text-left text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1">Source</th>
            <th className="px-2 py-1">Status</th>
            <th className="px-2 py-1">Health</th>
            <th className="px-2 py-1">Last discovery</th>
            <th className="px-2 py-1">Last extract</th>
            <th className="px-2 py-1">Fail</th>
            <th className="px-2 py-1">Extract rate</th>
            <th className="px-2 py-1">Avg conf</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-[rgb(var(--color-border))]">
              <td className="px-2 py-1">{r.name}</td>
              <td className="px-2 py-1">{r.status}</td>
              <td className="px-2 py-1">{r.healthScore}</td>
              <td className="px-2 py-1">{r.lastSuccessfulDiscoveryAt ? new Date(r.lastSuccessfulDiscoveryAt).toLocaleString('tr-TR') : '—'}</td>
              <td className="px-2 py-1">{r.lastSuccessfulExtractionAt ? new Date(r.lastSuccessfulExtractionAt).toLocaleString('tr-TR') : '—'}</td>
              <td className="px-2 py-1">{r.consecutiveFailures}</td>
              <td className="px-2 py-1">{r.extractionSuccessRate == null ? '—' : `${Math.round(r.extractionSuccessRate * 100)}%`}</td>
              <td className="px-2 py-1">{r.averageConfidence}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminOsPageShell>
  )
}
