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
  aiRequestsAvoided?: number
  httpRequests?: number
  browserRequests?: number
  lowConfidence?: number
  degradedSources?: number
  pausedSources?: number
  windows?: Record<string, { articlesFetched: number; successfulExtraction: number; lowConfidence: number; duplicates: number }>
  sources?: Array<{ name: string; status: string; healthScore: number; qualityTier: string }>
  funnel?: {
    rawArticles: number
    uniqueEvents: number
    aiEligibleEvents: number
    watching: number
    rejected: number
    highPriority: number
    potentialArticleLevelAiJobs: number
    uniqueEventCandidates: number
    aiEligibleEventJobs: number
    avoidedDuplicateEventJobs: number
    aiCostUsd: number
  }
  articlesWithPrimaryImage?: number
  articlesWithoutImage?: number
  imageCandidatesFound?: number
  imageCandidatesRejected?: number
  imageExtractionFailed?: number
  legacyRssIngest?: string
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
      title="Crawler Özeti"
      subtitle="Türkiye ağı. AI dispatch kapalı. Kaynaklar adil kuyrukla çekilir."
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
              { label: 'Aktif kaynak', value: fmt(data?.activeSources) },
              { label: 'Sıradaki kaynak', value: fmt(data?.sourcesDue) },
              { label: 'Keşfedilen URL', value: fmt(data?.urlsDiscovered) },
              { label: 'Yeni URL', value: fmt(data?.newUrls) },
              { label: 'Çekilen haber', value: fmt(data?.articlesFetched) },
              { label: 'Başarılı çıkarım', value: fmt(data?.extractionSuccess) },
              { label: 'Başarısız çıkarım', value: fmt(data?.extractionFailed) },
              { label: 'HTTP istekleri', value: fmt(data?.httpRequests) },
              { label: 'Tarayıcı istekleri', value: fmt(data?.browserRequests) },
              { label: 'Mükerrer', value: fmt(data?.duplicatesRemoved) },
              { label: 'Kaçınılan AI', value: fmt(data?.aiRequestsAvoided) },
              { label: 'AI’sız haber', value: fmt(data?.extractionSuccess) },
              { label: 'AI maliyeti', value: '$0', tone: 'ok' },
              { label: 'Düşük güven', value: fmt(data?.lowConfidence) },
              { label: 'Zayıf kaynak', value: fmt(data?.degradedSources) },
              { label: 'Duraklatılan', value: fmt(data?.pausedSources) },
              { label: 'Ham → olay', value: `${fmt(data?.funnel?.rawArticles)} → ${fmt(data?.funnel?.uniqueEvents)}` },
              { label: 'AI uygun olay', value: fmt(data?.funnel?.aiEligibleEvents) },
              { label: 'Kaçınılan olay işi', value: fmt(data?.funnel?.avoidedDuplicateEventJobs) },
              { label: 'İzlenen', value: fmt(data?.funnel?.watching) },
              { label: 'Yüksek öncelik', value: fmt(data?.funnel?.highPriority) },
              { label: 'Görselli haber', value: fmt(data?.articlesWithPrimaryImage) },
              { label: 'Görselsiz haber', value: fmt(data?.articlesWithoutImage) },
            ]}
          />
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Legacy RSS ingest: {data?.legacyRssIngest || 'ON'} · AI cost $0 (dispatch kapalı)
          </p>
          {data?.windows ? (
            <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[rgb(var(--color-surface))] text-[11px] uppercase text-[rgb(var(--color-muted))]">
                  <tr>
                    <th className="px-3 py-2">Pencere</th>
                    <th className="px-3 py-2">Fetched</th>
                    <th className="px-3 py-2">OK</th>
                    <th className="px-3 py-2">Low conf</th>
                    <th className="px-3 py-2">Dup</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.windows).map(([k, v]) => (
                    <tr key={k} className="border-t border-[rgb(var(--color-border))]">
                      <td className="px-3 py-2">{k}</td>
                      <td className="px-3 py-2">{fmt(v.articlesFetched)}</td>
                      <td className="px-3 py-2">{fmt(v.successfulExtraction)}</td>
                      <td className="px-3 py-2">{fmt(v.lowConfidence)}</td>
                      <td className="px-3 py-2">{fmt(v.duplicates)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          {data?.sources?.length ? (
            <div className="overflow-x-auto rounded-2xl border border-[rgb(var(--color-border))]">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[rgb(var(--color-surface))] text-[11px] uppercase text-[rgb(var(--color-muted))]">
                  <tr>
                    <th className="px-3 py-2">Source</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Tier</th>
                    <th className="px-3 py-2">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sources.map((s) => (
                    <tr key={s.name} className="border-t border-[rgb(var(--color-border))]">
                      <td className="px-3 py-2">{s.name}</td>
                      <td className="px-3 py-2">{s.status}</td>
                      <td className="px-3 py-2">{s.qualityTier}</td>
                      <td className="px-3 py-2">{fmt(s.healthScore)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}
    </AdminOsPageShell>
  )
}
