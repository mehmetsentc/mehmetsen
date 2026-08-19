'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminOsMetricGrid, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'
import { auth } from '@/lib/firebase/auth'

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function fmt(n: number | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return Math.round(n).toLocaleString('tr-TR')
}

interface DashboardResponse {
  enabled?: boolean
  aiDispatchEnabled?: boolean
  postgres?: boolean
  error?: string
  activeSources?: number
  sourcesDue?: number
  urlsDiscovered?: number
  newUrls?: number
  articlesFetched?: number
  extractionSuccess?: number
  extractionFailed?: number
  duplicatesRemoved?: number
  aiRequests?: number
  httpRequests?: number
  browserRequests?: number
}

export default function CrawlerDashboardPage() {
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/admin/crawler/dashboard', { headers: await authHeaders() })
      const body = (await res.json()) as DashboardResponse
      if (!res.ok) throw new Error(body.error || 'Yüklenemedi')
      setData(body)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Yüklenemedi')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <AdminOsPageShell
      title="Crawler"
      subtitle="Global haber keşfi — Phase 1. AI dispatch kapalı. Varsayılan crawl kapalı."
    >
      <CrawlerSubnav />
      {error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : (
        <>
          <p className="text-sm text-[rgb(var(--color-muted))]">
            Durum:{' '}
            <strong>{data?.enabled ? 'GLOBAL_CRAWLER_ENABLED=true' : 'kapalı'}</strong>
            {data?.aiDispatchEnabled ? ' · AI dispatch AÇIK' : ' · AI dispatch kapalı'}
            {data?.postgres === false ? ' · Postgres tanımlı değil' : null}
          </p>
          <AdminOsMetricGrid
            items={[
              { label: 'Active Sources', value: fmt(data?.activeSources) },
              { label: 'Sources Due', value: fmt(data?.sourcesDue) },
              { label: 'URLs Discovered', value: fmt(data?.urlsDiscovered) },
              { label: 'New URLs', value: fmt(data?.newUrls) },
              { label: 'Articles Fetched', value: fmt(data?.articlesFetched) },
              { label: 'Extraction Success', value: fmt(data?.extractionSuccess) },
              { label: 'Extraction Failed', value: fmt(data?.extractionFailed) },
              { label: 'HTTP Fetches', value: fmt(data?.httpRequests) },
              { label: 'Browser Fetches', value: fmt(data?.browserRequests) },
              { label: 'Duplicates', value: fmt(data?.duplicatesRemoved) },
              { label: 'AI Requests', value: fmt(data?.aiRequests ?? 0), tone: 'ok' },
            ]}
          />
        </>
      )}
    </AdminOsPageShell>
  )
}
