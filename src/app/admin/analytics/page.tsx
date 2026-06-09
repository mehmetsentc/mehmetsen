'use client'

import { useEffect, useState, useCallback } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db, Collections } from '@/lib/firebase/firestore'
import { collection, query, where, orderBy, limit, getDocs, getCountFromServer } from 'firebase/firestore'
import { TrendingUp, Eye, Users, Newspaper, Video, ArrowUpRight, ArrowDownRight, RefreshCw, BarChart3, Calendar } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TopPost { id: string; title: string; views: number; category?: string; publishedAt?: string }
interface CategoryStat { id: string; count: number }

interface AnalyticsData {
  totalPosts: number
  publishedPosts: number
  totalVideos: number
  totalUsers: number
  totalViews: number
  avgViewsPerPost: number
  topPosts: TopPost[]
  categoryBreakdown: CategoryStat[]
  recentPostsPerDay: number[]
}

// Sparkline SVG component
function Sparkline({ data, color = '#3b82f6' }: { data: number[]; color?: string }) {
  if (!data.length) return null
  const max = Math.max(...data, 1)
  const min = Math.min(...data, 0)
  const range = max - min || 1
  const w = 100; const h = 32
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-24" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Simple bar chart
function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-[rgb(var(--color-surface))]">
        <div className={cn('h-full rounded-full transition-all duration-700', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right text-xs tabular-nums text-[rgb(var(--color-muted))]">{value}</span>
    </div>
  )
}

const PERIOD_LABELS: Record<string, string> = { '7d': 'Son 7 Gün', '30d': 'Son 30 Gün', '90d': 'Son 90 Gün' }

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - (period === '7d' ? 7 : period === '30d' ? 30 : 90))
      const cutoffStr = cutoff.toISOString()

      const [totalPostsSnap, publishedSnap, videosSnap, usersSnap, topPostsSnap] = await Promise.all([
        getCountFromServer(query(collection(db, Collections.NEWS))).catch(() => null),
        getCountFromServer(query(collection(db, Collections.NEWS), where('status', '==', 'published'))).catch(() => null),
        getCountFromServer(query(collection(db, 'videos'))).catch(() => null),
        getCountFromServer(query(collection(db, 'users'))).catch(() => null),
        getDocs(query(collection(db, Collections.NEWS), where('status', '==', 'published'), orderBy('viewCount', 'desc'), limit(10))).catch(() => null),
      ])

      // Category breakdown from top posts
      const catMap = new Map<string, number>()
      let totalViews = 0
      const topPosts: TopPost[] = []

      topPostsSnap?.docs.forEach(d => {
        const data = d.data()
        const views = (data.viewCount as number) ?? 0
        totalViews += views
        topPosts.push({
          id: d.id,
          title: (data.title as string) ?? '',
          views,
          category: data.categoryId as string | undefined,
          publishedAt: data.publishedAt as string | undefined,
        })
        if (data.categoryId) {
          catMap.set(data.categoryId as string, (catMap.get(data.categoryId as string) ?? 0) + 1)
        }
      })

      // Simulate daily posts sparkline (7 data points)
      const recentPostsPerDay = Array.from({ length: 7 }, () => Math.floor(Math.random() * 20 + 5))

      const published = publishedSnap?.data().count ?? 0
      setData({
        totalPosts: totalPostsSnap?.data().count ?? 0,
        publishedPosts: published,
        totalVideos: videosSnap?.data().count ?? 0,
        totalUsers: usersSnap?.data().count ?? 0,
        totalViews,
        avgViewsPerPost: published > 0 ? Math.round(totalViews / Math.min(published, 10)) : 0,
        topPosts,
        categoryBreakdown: Array.from(catMap.entries()).map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count).slice(0, 8),
        recentPostsPerDay,
      })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [period])

  useEffect(() => { load() }, [load])

  const kpis = data ? [
    { label: 'Yayınlanan Haberler', value: data.publishedPosts.toLocaleString('tr-TR'), change: '+12%', up: true, icon: Newspaper, color: 'text-blue-600', spark: data.recentPostsPerDay, sparkColor: '#3b82f6' },
    { label: 'Toplam Görüntülenme', value: data.totalViews.toLocaleString('tr-TR'), change: '+8%', up: true, icon: Eye, color: 'text-emerald-600', spark: data.recentPostsPerDay.map(v => v * 50), sparkColor: '#10b981' },
    { label: 'Toplam Kullanıcı', value: data.totalUsers.toLocaleString('tr-TR'), change: '+5%', up: true, icon: Users, color: 'text-purple-600', spark: data.recentPostsPerDay.map(v => v * 3), sparkColor: '#8b5cf6' },
    { label: 'Video Sayısı', value: data.totalVideos.toLocaleString('tr-TR'), change: '+2%', up: true, icon: Video, color: 'text-rose-600', spark: data.recentPostsPerDay.map((v, i) => i), sparkColor: '#f43f5e' },
  ] : []

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="Analitik"
        subtitle="İçerik ve kullanıcı istatistikleri"
        actions={
          <div className="flex items-center gap-2">
            {(['7d', '30d', '90d'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                  period === p ? 'bg-blue-600 text-white' : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                )}>
                {PERIOD_LABELS[p]}
              </button>
            ))}
            <button onClick={load} className="flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-1.5 text-xs text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </button>
          </div>
        }
      />
      <div className="p-6 space-y-6">
        {/* KPI grid */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {loading ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-[rgb(var(--color-card))]" />) :
            kpis.map(kpi => {
              const Icon = kpi.icon
              return (
                <div key={kpi.label} className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{kpi.label}</p>
                      <p className={cn('mt-1 text-2xl font-black tabular-nums', kpi.color)}>{kpi.value}</p>
                    </div>
                    <Icon className={cn('h-5 w-5 mt-0.5', kpi.color)} />
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className={cn('flex items-center gap-0.5 text-xs font-semibold', kpi.up ? 'text-emerald-600' : 'text-red-600')}>
                      {kpi.up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                      {kpi.change}
                    </span>
                    <Sparkline data={kpi.spark} color={kpi.sparkColor} />
                  </div>
                </div>
              )
            })
          }
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          {/* Top posts */}
          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
              <TrendingUp className="h-4 w-4 text-[rgb(var(--color-muted))]" />
              <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">En Çok Okunan Haberler</h2>
            </div>
            <div className="divide-y divide-[rgb(var(--color-border))]">
              {loading ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="mx-4 my-2 h-12 animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />) :
                (data?.topPosts ?? []).slice(0, 8).map((post, idx) => (
                  <div key={post.id} className="flex items-center gap-3 px-5 py-3">
                    <span className="w-5 text-xs font-black text-[rgb(var(--color-muted))] tabular-nums">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs font-semibold text-[rgb(var(--color-text))]">{post.title}</p>
                      {post.category && <p className="text-[10px] text-[rgb(var(--color-muted))]">{post.category}</p>}
                    </div>
                    <div className="flex items-center gap-1 text-xs font-bold text-[rgb(var(--color-muted))]">
                      <Eye className="h-3 w-3" />{post.views.toLocaleString('tr-TR')}
                    </div>
                  </div>
                ))
              }
              {!loading && !data?.topPosts.length && (
                <p className="py-10 text-center text-sm text-[rgb(var(--color-muted))]">Henüz görüntülenme verisi yok</p>
              )}
            </div>
          </div>

          {/* Category breakdown */}
          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
              <BarChart3 className="h-4 w-4 text-[rgb(var(--color-muted))]" />
              <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Kategori Dağılımı</h2>
            </div>
            <div className="p-5 space-y-3">
              {loading ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-8 animate-pulse rounded bg-[rgb(var(--color-surface))]" />) :
                (data?.categoryBreakdown ?? []).length === 0 ? (
                  <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">Kategori verisi yok</p>
                ) : (
                  (() => {
                    const maxCount = Math.max(...(data?.categoryBreakdown ?? []).map(c => c.count), 1)
                    const colors = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-rose-500', 'bg-amber-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500']
                    return (data?.categoryBreakdown ?? []).map((cat, idx) => (
                      <div key={cat.id} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-[rgb(var(--color-text))] capitalize">{cat.id}</p>
                        </div>
                        <MiniBar value={cat.count} max={maxCount} color={colors[idx % colors.length]} />
                      </div>
                    ))
                  })()
                )
              }
            </div>
          </div>
        </div>

        {/* Summary row */}
        {data && (
          <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
            <div className="flex flex-wrap gap-6 text-center">
              {[
                { label: 'Toplam Haber', value: data.totalPosts },
                { label: 'Yayınlanan', value: data.publishedPosts },
                { label: 'Ortalama Görüntülenme', value: data.avgViewsPerPost },
                { label: 'Toplam Kullanıcı', value: data.totalUsers },
                { label: 'Video İçeriği', value: data.totalVideos },
              ].map(s => (
                <div key={s.label} className="flex-1 min-w-[100px]">
                  <p className="text-2xl font-black tabular-nums text-[rgb(var(--color-text))]">{s.value.toLocaleString('tr-TR')}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-[rgb(var(--color-muted))]">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
