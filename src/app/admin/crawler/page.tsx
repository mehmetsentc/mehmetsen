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
  uniqueUrls?: number
  newUrls?: number
  articlesFetched?: number
  extractionSuccess?: number
  extractionFailed?: number
  lowQualityExcluded?: number
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
    duplicateArticleJobsAvoided?: number
    actualAiRequests?: number
    multiSourceClusters?: number
    aiCostUsd: number
    estimatedCostLabel?: string
  }
  articlesWithPrimaryImage?: number
  articlesWithoutImage?: number
  imageCandidatesFound?: number
  imageCandidatesRejected?: number
  imageExtractionFailed?: number
  legacyRssIngest?: string
  ingestionLanes?: {
    crawler?: string
    legacyRssDiscovery?: string
    legacyDirectAi?: string
    crawlerAiDispatch?: string
    manualEditor?: string
    last24h?: {
      crawlerUrls?: number
      legacyRssUrls?: number
      duplicates?: number
      rawArticles?: number
      clusters?: number
      automaticAiRequests?: number
      unmappedLegacySources?: number
      forwardedToCrawler?: number
      legacyDirectAiBlocked?: number
    }
    automaticAiCostUsd?: { crawler?: number; legacy?: number; manualEditor?: number | null }
  }
  editorial?: {
    approvedForAi?: number
    editorRejected?: number
    archived?: number
    inReview?: number
    watching?: number
    eligible?: number
    aiWaiting?: number
    highPriority?: number
    breaking?: number
    staleApproved?: number
    olderThan24h?: number
    rawArticles?: number
    uniqueEvents?: number
    automaticAiRequests?: number
    automaticAiCostUsd?: number
    actualAiCostUsd?: number
    estimatedCostLabel?: string
    dispatchEnabled?: boolean
    pipeline?: {
      discovered?: number
      rawArticles?: number
      clusters?: number
      preAi?: number
      editorApproved?: number
      aiDispatch?: number
    }
  }
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
              { label: 'Tekil URL', value: fmt(data?.uniqueUrls ?? data?.newUrls) },
              { label: 'Düşük kalite hariç', value: fmt(data?.lowQualityExcluded) },
              { label: 'Çok kaynaklı olay', value: fmt(data?.funnel?.multiSourceClusters) },
              { label: 'Önlenen mükerrer iş', value: fmt(data?.funnel?.duplicateArticleJobsAvoided ?? data?.funnel?.avoidedDuplicateEventJobs) },
              { label: 'Gerçek AI istek', value: fmt(data?.funnel?.actualAiRequests ?? data?.aiRequests), tone: 'ok' },
              { label: 'Yeni URL', value: fmt(data?.newUrls) },
              { label: 'Çekilen haber', value: fmt(data?.articlesFetched) },
              { label: 'Başarılı çıkarım', value: fmt(data?.extractionSuccess) },
              { label: 'Başarısız çıkarım', value: fmt(data?.extractionFailed) },
              { label: 'HTTP istekleri', value: fmt(data?.httpRequests) },
              { label: 'Tarayıcı istekleri', value: fmt(data?.browserRequests) },
              { label: 'Mükerrer', value: fmt(data?.duplicatesRemoved) },
              { label: 'Kaçınılan AI', value: fmt(data?.aiRequestsAvoided) },
              { label: 'AI’sız haber', value: fmt(data?.extractionSuccess) },
              { label: 'Düşük güven', value: fmt(data?.lowConfidence) },
              { label: 'Zayıf kaynak', value: fmt(data?.degradedSources) },
              { label: 'Duraklatılan', value: fmt(data?.pausedSources) },
              { label: 'Ham Haberler', value: fmt(data?.editorial?.rawArticles ?? data?.funnel?.rawArticles) },
              { label: 'Olay Kümeleri', value: fmt(data?.editorial?.uniqueEvents ?? data?.funnel?.uniqueEvents) },
              { label: 'İzlenen', value: fmt(data?.editorial?.watching ?? data?.funnel?.watching) },
              { label: 'Uygun', value: fmt(data?.editorial?.eligible ?? data?.funnel?.aiEligibleEvents) },
              { label: 'AI İçin Onaylanan', value: fmt(data?.editorial?.approvedForAi) },
              { label: 'AI Bekleyen', value: fmt(data?.editorial?.aiWaiting ?? data?.editorial?.approvedForAi) },
              { label: 'Reddedilen', value: fmt(data?.editorial?.editorRejected ?? data?.funnel?.rejected) },
              { label: 'Arşivlenen', value: fmt(data?.editorial?.archived) },
              { label: 'İncelemede', value: fmt(data?.editorial?.inReview) },
              { label: 'Yüksek Öncelik', value: fmt(data?.editorial?.highPriority ?? data?.funnel?.highPriority) },
              { label: 'Son Dakika', value: fmt(data?.editorial?.breaking) },
              { label: '24 Saatten Eski', value: fmt(data?.editorial?.olderThan24h) },
              { label: '24 Saatten Eski Onaylı', value: fmt(data?.editorial?.staleApproved) },
              { label: 'Gerçek AI maliyeti', value: '$0', tone: 'ok' },
              { label: 'Tahmini AI maliyeti', value: data?.editorial?.estimatedCostLabel || data?.funnel?.estimatedCostLabel || 'COST_UNKNOWN' },
              { label: 'Otomatik AI istek', value: fmt(data?.editorial?.automaticAiRequests ?? 0), tone: 'ok' },
              { label: 'Görselli haber', value: fmt(data?.articlesWithPrimaryImage) },
              { label: 'Görselsiz haber', value: fmt(data?.articlesWithoutImage) },
              { label: 'Editör reddetti', value: fmt(data?.editorial?.editorRejected) },
              { label: 'Arşivlenen', value: fmt(data?.editorial?.archived) },
              { label: 'AI dispatch', value: data?.editorial?.dispatchEnabled ? 'AÇIK' : 'KAPALI', tone: 'ok' },
            ]}
          />
          {data?.editorial?.pipeline ? (
            <section className="rounded-2xl border border-[rgb(var(--color-border))] p-4 text-sm">
              <h2 className="mb-3 text-sm font-semibold">Haber hattı</h2>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  ['KEŞFEDİLEN', data.editorial.pipeline.discovered],
                  ['HAM HABER', data.editorial.pipeline.rawArticles],
                  ['OLAY KÜMESİ', data.editorial.pipeline.clusters],
                  ['ÖN-AI', data.editorial.pipeline.preAi],
                  ['EDİTÖR ONAYI', data.editorial.pipeline.editorApproved],
                  ['AI DISPATCH [KAPALI]', data.editorial.pipeline.aiDispatch],
                ].map(([label, value], i) => (
                  <span key={String(label)} className="flex items-center gap-2">
                    {i ? <span className="text-[rgb(var(--color-muted))]">↓</span> : null}
                    <span className="rounded-lg bg-[rgb(var(--color-surface))] px-3 py-2">
                      <strong>{label}</strong> {fmt(Number(value))}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}
          <p className="text-xs text-[rgb(var(--color-muted))]">
            Legacy RSS: {data?.legacyRssIngest || 'ADAPTER'} · gerçek otomatik AI $0 · tahmini COST_UNKNOWN
          </p>
          {data?.ingestionLanes ? (
            <section className="rounded-2xl border border-[rgb(var(--color-border))] p-4">
              <h2 className="mb-3 text-sm font-semibold">Haber Giriş Hatları</h2>
              <AdminOsMetricGrid
                items={[
                  { label: 'Global Crawler', value: data.ingestionLanes.crawler || '—' },
                  { label: 'Legacy RSS Keşfi', value: data.ingestionLanes.legacyRssDiscovery || '—' },
                  { label: 'Legacy Doğrudan AI', value: data.ingestionLanes.legacyDirectAi || 'Kapalı', tone: data.ingestionLanes.legacyDirectAi === 'Kapalı' ? 'ok' : 'warn' },
                  { label: 'Crawler AI Dispatch', value: data.ingestionLanes.crawlerAiDispatch || 'Kapalı', tone: 'ok' },
                  { label: 'Manuel AI Editörü', value: data.ingestionLanes.manualEditor || 'Kullanılabilir', tone: 'ok' },
                  { label: 'Crawler URL (bugün)', value: fmt(data.ingestionLanes.last24h?.crawlerUrls) },
                  { label: 'Legacy RSS URL', value: fmt(data.ingestionLanes.last24h?.legacyRssUrls) },
                  { label: 'Ortak/duplicate URL', value: fmt(data.ingestionLanes.last24h?.duplicates) },
                  { label: 'Ham Haber', value: fmt(data.ingestionLanes.last24h?.rawArticles) },
                  { label: 'Olay Kümesi', value: fmt(data.ingestionLanes.last24h?.clusters) },
                  { label: 'AI’ya otomatik', value: fmt(data.ingestionLanes.last24h?.automaticAiRequests), tone: 'ok' },
                  { label: 'Eşleşmeyen kaynak', value: fmt(data.ingestionLanes.last24h?.unmappedLegacySources) },
                ]}
              />
            </section>
          ) : null}
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
