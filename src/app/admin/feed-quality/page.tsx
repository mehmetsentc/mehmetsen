'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  AdminOsMetricGrid,
  AdminOsPageShell,
} from '@/components/admin/os/AdminOsPageShell'
import { auth } from '@/lib/firebase/auth'
import { loadAdminJson } from '@/lib/adminApiError'
import type { FeedMode } from '@/types/smartFeed'

interface QualityData {
  ok: boolean
  timestamp: string
  query: {
    userId: string
    mode: FeedMode
    limit: number
  }
  performance: {
    latencyMs: number
    itemCount: number
    rankingVersion: string
    emptyReason?: string
  }
  pilotActivity?: {
    impressionsCount: number
    socialEventsCount: number
    likesCount: number
    savesCount: number
    followsCount: number
    feedbackCount: number
    interestScoresCount: number
    affinityCount: number
    hasHumanData: boolean
    recentImpressions: Array<{
      articleId: string
      feedType: string
      impressionCount: number
      lastSeenAt: string
    }>
    recentEvents: Array<{
      eventType: string
      targetType: string | null
      targetId: string | null
      createdAt: string
    }>
  }
  qualityGates: {
    passed: boolean
    missingTitles: number
    placeholderCount: number
    testPublisherCount: number
    missingSlugs: number
    missingMedia: number
    missingSummary: number
  }
  clusterStats: {
    uniqueArticles: number
    uniqueClusters: number
    clusterDuplicates: number
  }
  publisherDiversity: {
    uniquePublishers: number
    topPublisherSharePercent: number
    maxConsecutiveRuns: number
    distribution: Record<string, number>
  }
  categoryDiversity: {
    uniqueCategories: number
    distribution: Record<string, number>
  }
  freshness: {
    medianAgeHours: number
    p90AgeHours: number
    buckets: Record<string, number>
  }
  userFeatures: Array<{
    featureKey: string
    enabled: boolean
    reason?: string | null
  }>
  items: Array<{
    position: number
    articleId: string
    headline: string
    summary: string | null
    publisher: string
    publisherSlug: string
    category: string
    clusterId: string | null
    ageHours: number
    reason: string
    score: number
    breaking: boolean
    materialUpdate: boolean
    clusterSourceCount: number
    hasMedia: boolean
    slug: string
  }>
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export default function FeedQualityPage() {
  const [data, setData] = useState<QualityData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<FeedMode>('personal')
  const [targetUserId, setTargetUserId] = useState('ap3scBglLIVwflfZN4qL8PKrM1A3')

  const fetchQuality = useCallback(async () => {
    setLoading(true)
    setError(null)
    const result = await loadAdminJson<QualityData>(
      `/api/admin/feed-quality?userId=${encodeURIComponent(targetUserId)}&mode=${mode}&limit=30`,
      { headers: await authHeaders() }
    )
    if (!result.ok) {
      setError(result.error)
      setLoading(false)
      return
    }
    setData(result.data)
    setLoading(false)
  }, [mode, targetUserId])

  useEffect(() => {
    void fetchQuality()
  }, [fetchQuality])

  return (
    <AdminOsPageShell
      title="Smart Feed Kalite ve Alaka Analitiği"
      subtitle="Faz P15 — Kontrollü pilot kullanıcı akış telemetrisi, tazelik, çeşitlilik ve kapı denetimleri."
    >
      {/* Controls */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-zinc-500 uppercase">Mod:</label>
            <div className="flex gap-1.5">
              {(['personal', 'breaking', 'following', 'local'] as FeedMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    mode === m
                      ? 'bg-blue-600 text-white'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200'
                  }`}
                >
                  {m === 'personal' ? 'Sana Özel' : m === 'breaking' ? 'Son Dakika' : m === 'following' ? 'Takip' : 'Yerel'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={targetUserId}
              onChange={(e) => setTargetUserId(e.target.value)}
              placeholder="User UID"
              className="px-3 py-1.5 text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-800 dark:text-zinc-200 w-64"
            />
            <button
              onClick={() => void fetchQuality()}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-semibold bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg hover:opacity-90 disabled:opacity-50"
            >
              {loading ? 'Yenileniyor...' : 'Yenile'}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 mb-6 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl">
          Hata: {error}
        </div>
      )}

      {data && (
        <>
          {/* Key Metrics */}
          <AdminOsMetricGrid
            items={[
              {
                label: 'İstek Gecikmesi',
                value: `${data.performance.latencyMs} ms`,
                hint: `Sürüm: ${data.performance.rankingVersion}`,
              },
              {
                label: 'Dönen Öğe Sayısı',
                value: `${data.performance.itemCount}`,
                hint: data.performance.emptyReason ? `Boş: ${data.performance.emptyReason}` : 'Akış dolu',
              },
              {
                label: 'Kalite Kapıları',
                value: data.qualityGates.passed ? 'GEÇTİ' : 'UYARI / TEST',
                hint: `Başlık: ${data.qualityGates.missingTitles}, Taslak: ${data.qualityGates.placeholderCount}`,
                tone: data.qualityGates.passed ? 'ok' : 'warn',
              },
              {
                label: 'Yayıncı Çeşitliliği',
                value: `${data.publisherDiversity.uniquePublishers} kaynak`,
                hint: `En yüksek pay: %${data.publisherDiversity.topPublisherSharePercent}`,
              },
              {
                label: 'Tazelik (Medyan)',
                value: `${data.freshness.medianAgeHours} sa`,
                hint: `p90: ${data.freshness.p90AgeHours} sa`,
              },
              {
                label: 'Kategori Çeşitliliği',
                value: `${data.categoryDiversity.uniqueCategories} kategori`,
                hint: `Benzersiz küme: ${data.clusterStats.uniqueClusters}`,
              },
            ]}
          />

          {/* User Grants */}
          <div className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-3">
              Pilot Kullanıcı Erişim İzinleri ({data.query.userId})
            </h3>
            <div className="flex flex-wrap gap-2">
              {data.userFeatures.map((f) => (
                <span
                  key={f.featureKey}
                  className={`px-2.5 py-1 text-xs font-semibold rounded-md border ${
                    f.enabled
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700'
                  }`}
                >
                  {f.featureKey}: {f.enabled ? 'AÇIK' : 'KAPALI'}
                </span>
              ))}
            </div>
          </div>

          {/* Real Pilot Activity (Phase P17) */}
          {data.pilotActivity && (
            <div className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  Gerçek Pilot Kullanıcı Aktivite ve Telemetrisi (Faz P17)
                </h3>
                <span
                  className={`px-3 py-1 text-xs font-bold rounded-full border ${
                    data.pilotActivity.hasHumanData
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800'
                      : 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800'
                  }`}
                >
                  {data.pilotActivity.hasHumanData
                    ? 'CANLI KULLANICI ETKİLEŞİMİ MEVCUT'
                    : 'READY — WAITING FOR HUMAN PILOT DATA'}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-4">
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 text-center">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase">Gösterim</div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{data.pilotActivity.impressionsCount}</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 text-center">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase">Telemetri</div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{data.pilotActivity.socialEventsCount}</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 text-center">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase">Beğeni</div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{data.pilotActivity.likesCount}</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 text-center">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase">Kaydetme</div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{data.pilotActivity.savesCount}</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 text-center">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase">Takip</div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{data.pilotActivity.followsCount}</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 text-center">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase">Negatif Geri Bildirim</div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{data.pilotActivity.feedbackCount}</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 text-center">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase">İlgi Skoru</div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{data.pilotActivity.interestScoresCount}</div>
                </div>
                <div className="bg-zinc-50 dark:bg-zinc-800/60 p-3 rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 text-center">
                  <div className="text-[11px] font-medium text-zinc-500 uppercase">Yayıncı Eğilimi</div>
                  <div className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{data.pilotActivity.affinityCount}</div>
                </div>
              </div>

              {data.pilotActivity.recentEvents.length > 0 ? (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Son Telemetri Olayları</h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase">
                          <th className="py-1.5 px-2">Olay Türü</th>
                          <th className="py-1.5 px-2">Hedef Türü</th>
                          <th className="py-1.5 px-2">Hedef ID</th>
                          <th className="py-1.5 px-2 text-right">Zaman</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {data.pilotActivity.recentEvents.map((e, idx) => (
                          <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                            <td className="py-1.5 px-2 font-mono font-medium text-blue-600 dark:text-blue-400">{e.eventType}</td>
                            <td className="py-1.5 px-2 text-zinc-600 dark:text-zinc-400">{e.targetType || '—'}</td>
                            <td className="py-1.5 px-2 font-mono text-zinc-500 truncate max-w-xs">{e.targetId || '—'}</td>
                            <td className="py-1.5 px-2 text-right text-zinc-400 font-mono">{new Date(e.createdAt).toLocaleTimeString('tr-TR')}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  Bu pilot kullanıcı için henüz kaydedilmiş telemetri/gösterim verisi bulunmuyor (doğal insan etkileşimi bekleniyor).
                </p>
              )}
            </div>
          )}

          {/* First Items Audit */}
          <div className="mt-6 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4">
              İlk {data.items.length} Öğe Kalite ve Sıralama Detayları
            </h3>
            {data.items.length === 0 ? (
              <p className="text-xs text-zinc-500">Bu mod için henüz uygun içerik bulunmuyor ({data.performance.emptyReason || 'no_items'}).</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase">
                      <th className="py-2.5 px-2">#</th>
                      <th className="py-2.5 px-2">Başlık</th>
                      <th className="py-2.5 px-2">Yayıncı</th>
                      <th className="py-2.5 px-2">Kategori</th>
                      <th className="py-2.5 px-2">Yaş (sa)</th>
                      <th className="py-2.5 px-2">Gerekçe Kodu</th>
                      <th className="py-2.5 px-2 text-right">Skor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {data.items.map((it) => (
                      <tr key={it.articleId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                        <td className="py-2.5 px-2 font-mono text-zinc-400">{it.position}</td>
                        <td className="py-2.5 px-2 font-medium text-zinc-900 dark:text-zinc-100 max-w-md truncate">
                          {it.headline}
                        </td>
                        <td className="py-2.5 px-2 text-zinc-600 dark:text-zinc-400">{it.publisher}</td>
                        <td className="py-2.5 px-2">
                          <span className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono">
                            {it.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-zinc-600 dark:text-zinc-400">{it.ageHours}</td>
                        <td className="py-2.5 px-2">
                          <span className="px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-mono font-semibold">
                            {it.reason}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                          {it.score.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </AdminOsPageShell>
  )
}
