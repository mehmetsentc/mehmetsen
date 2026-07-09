'use client'

import { useEffect, useState, useCallback } from 'react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { db } from '@/lib/firebase/firestore'
import { Collections } from '@/lib/firebase/collections'
import { collection, query, where, orderBy, limit, getDocs, getCountFromServer, doc, getDoc } from 'firebase/firestore'
import {
  TrendingUp, Eye, Users, Newspaper, RefreshCw, BarChart3,
  Globe, Monitor, Smartphone, ExternalLink, Activity, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ── Types ──────────────────────────────────────────────────────────────────
interface DailyDoc {
  total?: number
  devices?: Record<string, number>
  os?: Record<string, number>
  pages?: Record<string, number>
  referrers?: Record<string, number>
}

interface TopPost { id: string; title: string; views: number; category?: string; slug?: string }

// ── Vitals types ───────────────────────────────────────────────────────────
interface MetricBuckets { good?: number; ni?: number; poor?: number; sum?: number; count?: number }
interface VitalsDoc {
  path: string
  FCP?: MetricBuckets; LCP?: MetricBuckets; INP?: MetricBuckets
  CLS?: MetricBuckets; TTFB?: MetricBuckets
}
interface RouteVitals { path: string; score: number; lcp: number; fcp: number; inp: number; cls: number; ttfb: number; samples: number }

interface DashData {
  totalViews: number
  totalUsers: number
  totalPosts: number
  days: { date: string; views: number }[]
  topPages: { path: string; views: number }[]
  referrers: { domain: string; views: number }[]
  devices: { mobile: number; desktop: number }
  os: Record<string, number>
  topPosts: TopPost[]
  vitals: RouteVitals[]
}

type Period = '7d' | '30d' | 'today'

// ── Helpers ────────────────────────────────────────────────────────────────
function dateRange(period: Period): string[] {
  const days: string[] = []
  const n = period === 'today' ? 1 : period === '7d' ? 7 : 30
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }
  return days
}

function unSanitizeDomain(s: string) {
  return s.replace(/_/g, '.')
}

// ── Vitals helpers ─────────────────────────────────────────────────────────
function avg(m?: MetricBuckets): number {
  if (!m?.count || !m?.sum) return 0
  return Math.round(m.sum / m.count)
}
function goodPct(m?: MetricBuckets): number {
  const total = (m?.good ?? 0) + (m?.ni ?? 0) + (m?.poor ?? 0)
  return total > 0 ? Math.round(((m?.good ?? 0) / total) * 100) : 0
}
/** Compute a 0-100 score from LCP + CLS + INP good% (weighted) */
function computeScore(doc: VitalsDoc): number {
  const lcpPct = goodPct(doc.LCP)
  const clsPct = goodPct(doc.CLS)
  const inpPct = goodPct(doc.INP)
  const fcpPct = goodPct(doc.FCP)
  const count = [doc.LCP, doc.CLS, doc.INP, doc.FCP].filter(Boolean).length
  if (count === 0) return 0
  return Math.round((lcpPct * 0.4 + clsPct * 0.2 + inpPct * 0.2 + fcpPct * 0.2))
}
function scoreBadge(score: number) {
  if (score >= 90) return { label: 'İyi', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' }
  if (score >= 50) return { label: 'Orta', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' }
  return { label: 'Zayıf', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' }
}

// ── Sub-components ─────────────────────────────────────────────────────────
function LineChart({ data }: { data: { date: string; views: number }[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.views), 1)
  const w = 600; const h = 80
  const pts = data.map((d, i) => {
    const x = (i / Math.max(data.length - 1, 1)) * w
    const y = h - (d.views / max) * (h - 8)
    return `${x},${y}`
  }).join(' ')
  const area = `0,${h} ${pts} ${w},${h}`
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20" preserveAspectRatio="none">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#grad)" />
      <polyline points={pts} fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function BarRow({ label, value, max, color = 'bg-blue-500' }: { label: string; value: number; max: number; color?: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div className="flex items-center gap-3">
      <span className="w-32 shrink-0 truncate text-xs text-[rgb(var(--color-text))]">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-[rgb(var(--color-surface))] overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 text-right text-xs font-bold tabular-nums text-[rgb(var(--color-muted))]">{value.toLocaleString('tr-TR')}</span>
    </div>
  )
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ElementType; color: string }) {
  return (
    <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-muted))]">{label}</p>
          <p className={cn('mt-1 text-2xl font-black tabular-nums', color)}>{value}</p>
        </div>
        <Icon className={cn('h-5 w-5 mt-0.5', color)} />
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────────────────────────
const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: 'Bugün' },
  { id: '7d', label: '7 Gün' },
  { id: '30d', label: '30 Gün' },
]

const OS_LABELS: Record<string, string> = {
  ios: 'iOS', android: 'Android', windows: 'Windows', mac: 'macOS', linux: 'Linux', other: 'Diğer',
}
const OS_COLORS = ['bg-blue-500', 'bg-emerald-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500', 'bg-slate-400']

export default function AnalyticsPage() {
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('7d')

  const load = useCallback(async () => {
    setLoading(true)
    const dates = dateRange(period)

    // Firebase counts — independent of analytics collections
    const [usersSnap, postsSnap, topPostsSnap] = await Promise.all([
      getCountFromServer(query(collection(db, 'users'))).catch(() => null),
      getCountFromServer(query(collection(db, Collections.NEWS), where('status', '==', 'published'))).catch(() => null),
      getDocs(query(collection(db, Collections.NEWS), where('status', '==', 'published'), orderBy('viewsCount', 'desc'), limit(10))).catch(() => null),
    ])

    const topPosts: TopPost[] = (topPostsSnap?.docs ?? []).map(d => {
      const dd = d.data()
      return { id: d.id, title: dd.title as string ?? '', views: (dd.viewsCount as number) ?? 0, category: dd.categoryId as string, slug: dd.slug as string }
    })

    let totalViews = 0
    const pageMap = new Map<string, number>()
    const refMap = new Map<string, number>()
    let mobile = 0; let desktop = 0
    const osMap = new Map<string, number>()
    let days = dates.map(date => ({ date, views: 0 }))
    let vitals: RouteVitals[] = []

    try {
      const dailyDocs = await Promise.all(
        dates.map(d => getDoc(doc(db, Collections.ANALYTICS_DAILY, d)).then(s => ({ date: d, data: s.data() as DailyDoc | undefined })))
      )

      days = dailyDocs.map(({ date, data: d }) => {
        const v = d?.total ?? 0
        totalViews += v
        Object.entries(d?.pages ?? {}).forEach(([p, n]) => pageMap.set(p, (pageMap.get(p) ?? 0) + n))
        Object.entries(d?.referrers ?? {}).forEach(([r, n]) => refMap.set(r, (refMap.get(r) ?? 0) + n))
        mobile += d?.devices?.mobile ?? 0
        desktop += d?.devices?.desktop ?? 0
        Object.entries(d?.os ?? {}).forEach(([o, n]) => osMap.set(o, (osMap.get(o) ?? 0) + n))
        return { date, views: v }
      })

      const vitalsSnap = await getDocs(collection(db, Collections.ANALYTICS_VITALS)).catch(() => null)
      vitals = (vitalsSnap?.docs ?? []).map(d => {
        const v = d.data() as VitalsDoc
        return {
          path: v.path ?? d.id,
          score: computeScore(v),
          lcp: avg(v.LCP),
          fcp: avg(v.FCP),
          inp: avg(v.INP),
          cls: avg(v.CLS),
          ttfb: avg(v.TTFB),
          samples: v.LCP?.count ?? v.FCP?.count ?? 0,
        }
      }).filter(r => r.samples > 0).sort((a, b) => b.samples - a.samples)
    } catch (e) {
      console.error('[admin/analytics] analyticsDaily read failed:', e)
    }

    const topPages = [...pageMap.entries()]
      .filter(([p]) => !p.startsWith('/admin') && !p.startsWith('/api'))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([path, views]) => ({ path: path.replace(/_/g, '.'), views }))

    const referrers = [...refMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([domain, views]) => ({ domain: unSanitizeDomain(domain), views }))

    setData({
      totalViews,
      totalUsers: usersSnap?.data().count ?? 0,
      totalPosts: postsSnap?.data().count ?? 0,
      days,
      topPages,
      referrers,
      devices: { mobile, desktop },
      os: Object.fromEntries(osMap),
      topPosts,
      vitals,
    })
    setLoading(false)
  }, [period])

  useEffect(() => { load() }, [load])

  const totalDevice = (data?.devices.mobile ?? 0) + (data?.devices.desktop ?? 0)
  const osEntries = Object.entries(data?.os ?? {}).sort((a, b) => b[1] - a[1])
  const maxOs = Math.max(...osEntries.map(e => e[1]), 1)

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="Analitik"
        subtitle="Sayfa görüntülenme ve trafik istatistikleri"
        actions={
          <div className="flex items-center gap-2">
            {PERIODS.map(p => (
              <button key={p.id} onClick={() => setPeriod(p.id)}
                className={cn('rounded-lg px-3 py-1.5 text-xs font-bold transition-all',
                  period === p.id
                    ? 'bg-blue-600 text-white'
                    : 'border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]'
                )}>
                {p.label}
              </button>
            ))}
            <button onClick={load} className="flex items-center gap-1 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-1.5 text-xs text-[rgb(var(--color-muted))] hover:text-[rgb(var(--color-text))]">
              <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
            </button>
          </div>
        }
      />

      <div className="p-6 space-y-6">

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-3">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[rgb(var(--color-card))]" />)
            : <>
              <KpiCard label="Sayfa Görüntülenme" value={(data?.totalViews ?? 0).toLocaleString('tr-TR')} icon={Eye} color="text-blue-600" />
              <KpiCard label="Toplam Kullanıcı" value={(data?.totalUsers ?? 0).toLocaleString('tr-TR')} icon={Users} color="text-emerald-600" />
              <KpiCard label="Yayınlanan Haber" value={(data?.totalPosts ?? 0).toLocaleString('tr-TR')} icon={Newspaper} color="text-purple-600" />
            </>
          }
        </div>

        {/* Traffic chart */}
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
          <div className="mb-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Günlük Trafik</h2>
          </div>
          {loading
            ? <div className="h-20 animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />
            : data?.days.every(d => d.views === 0)
              ? <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">Henüz veri yok — ilk ziyaretler kaydediliyor</p>
              : <>
                <LineChart data={data?.days ?? []} />
                <div className="mt-2 flex justify-between text-[10px] text-[rgb(var(--color-muted))]">
                  <span>{data?.days[0]?.date}</span>
                  <span>{data?.days[data.days.length - 1]?.date}</span>
                </div>
              </>
          }
        </div>

        <div className="grid gap-6 xl:grid-cols-2">

          {/* Top pages */}
          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
              <Globe className="h-4 w-4 text-[rgb(var(--color-muted))]" />
              <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">En Çok Ziyaret Edilen Sayfalar</h2>
            </div>
            <div className="divide-y divide-[rgb(var(--color-border))]">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="mx-4 my-2 h-8 animate-pulse rounded bg-[rgb(var(--color-surface))]" />)
                : data?.topPages.length === 0
                  ? <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">Henüz veri yok</p>
                  : data?.topPages.map((p, i) => (
                    <div key={p.path} className="flex items-center gap-3 px-5 py-2.5">
                      <span className="w-5 text-xs font-black text-[rgb(var(--color-muted))]">{i + 1}</span>
                      <span className="flex-1 truncate font-mono text-xs text-[rgb(var(--color-text))]">{p.path}</span>
                      <span className="flex items-center gap-1 text-xs font-bold text-blue-600">
                        <Eye className="h-3 w-3" />{p.views.toLocaleString('tr-TR')}
                      </span>
                    </div>
                  ))
              }
            </div>
          </div>

          {/* Top articles */}
          <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
              <TrendingUp className="h-4 w-4 text-[rgb(var(--color-muted))]" />
              <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">En Çok Okunan Haberler</h2>
            </div>
            <div className="divide-y divide-[rgb(var(--color-border))]">
              {loading
                ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="mx-4 my-2 h-10 animate-pulse rounded bg-[rgb(var(--color-surface))]" />)
                : (data?.topPosts ?? []).slice(0, 8).map((post, idx) => (
                  <div key={post.id} className="flex items-center gap-3 px-5 py-2.5">
                    <span className="w-5 text-xs font-black text-[rgb(var(--color-muted))]">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-1 text-xs font-semibold text-[rgb(var(--color-text))]">{post.title}</p>
                      {post.category && <p className="text-[10px] text-[rgb(var(--color-muted))]">{post.category}</p>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-emerald-600">{post.views.toLocaleString('tr-TR')}</span>
                      {post.slug && (
                        <a href={`/haber/${post.slug}`} target="_blank" rel="noopener noreferrer"
                          className="text-[rgb(var(--color-muted))] hover:text-blue-500">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))
              }
              {!loading && !data?.topPosts.length && (
                <p className="py-8 text-center text-sm text-[rgb(var(--color-muted))]">Henüz görüntülenme yok</p>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-3">

          {/* Referrers */}
          <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
            <div className="mb-4 flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-[rgb(var(--color-muted))]" />
              <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Kaynaklar</h2>
            </div>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="mb-2 h-6 animate-pulse rounded bg-[rgb(var(--color-surface))]" />)
              : data?.referrers.length === 0
                ? <p className="py-6 text-center text-sm text-[rgb(var(--color-muted))]">Veri yok</p>
                : <div className="space-y-2.5">
                  {data?.referrers.map((r, i) => (
                    <BarRow key={r.domain} label={r.domain || '(direkt)'} value={r.views}
                      max={data.referrers[0]?.views ?? 1}
                      color={['bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500'][i % 4]} />
                  ))}
                </div>
            }
          </div>

          {/* Devices */}
          <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
            <div className="mb-4 flex items-center gap-2">
              <Monitor className="h-4 w-4 text-[rgb(var(--color-muted))]" />
              <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Cihazlar</h2>
            </div>
            {loading
              ? <div className="h-20 animate-pulse rounded bg-[rgb(var(--color-surface))]" />
              : <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <Smartphone className="h-4 w-4 text-blue-500" />
                  <div className="flex-1">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-[rgb(var(--color-text))]">Mobil</span>
                      <span className="font-bold text-blue-600">
                        {totalDevice > 0 ? Math.round((data!.devices.mobile / totalDevice) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[rgb(var(--color-surface))]">
                      <div className="h-full rounded-full bg-blue-500"
                        style={{ width: `${totalDevice > 0 ? (data!.devices.mobile / totalDevice) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Monitor className="h-4 w-4 text-emerald-500" />
                  <div className="flex-1">
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="text-[rgb(var(--color-text))]">Masaüstü</span>
                      <span className="font-bold text-emerald-600">
                        {totalDevice > 0 ? Math.round((data!.devices.desktop / totalDevice) * 100) : 0}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-[rgb(var(--color-surface))]">
                      <div className="h-full rounded-full bg-emerald-500"
                        style={{ width: `${totalDevice > 0 ? (data!.devices.desktop / totalDevice) * 100 : 0}%` }} />
                    </div>
                  </div>
                </div>
                <div className="mt-4 border-t border-[rgb(var(--color-border))] pt-3 text-center">
                  <p className="text-[10px] text-[rgb(var(--color-muted))]">Toplam kayıtlı: {totalDevice.toLocaleString('tr-TR')}</p>
                </div>
              </div>
            }
          </div>

          {/* OS breakdown */}
          <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[rgb(var(--color-muted))]" />
              <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">İşletim Sistemi</h2>
            </div>
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="mb-2 h-6 animate-pulse rounded bg-[rgb(var(--color-surface))]" />)
              : osEntries.length === 0
                ? <p className="py-6 text-center text-sm text-[rgb(var(--color-muted))]">Veri yok</p>
                : <div className="space-y-2.5">
                  {osEntries.map(([os, count], i) => (
                    <BarRow key={os} label={OS_LABELS[os] ?? os} value={count} max={maxOs} color={OS_COLORS[i % OS_COLORS.length]} />
                  ))}
                </div>
            }
          </div>
        </div>

        {/* ── Speed Insights ── */}
        <div className="overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
            <Zap className="h-4 w-4 text-amber-500" />
            <h2 className="text-sm font-bold text-[rgb(var(--color-text))]">Speed Insights — Sayfa Performansı</h2>
            <span className="ml-auto text-[10px] text-[rgb(var(--color-muted))]">Core Web Vitals (ortalama)</span>
          </div>
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-[rgb(var(--color-surface))]" />)}
            </div>
          ) : data?.vitals.length === 0 ? (
            <div className="py-12 text-center">
              <Zap className="mx-auto mb-2 h-8 w-8 text-[rgb(var(--color-muted))] opacity-30" />
              <p className="text-sm text-[rgb(var(--color-muted))]">Henüz veri toplanmadı — deploy sonrası ziyaretlerle dolmaya başlar</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]">
                    <th className="px-5 py-2.5 text-left font-bold text-[rgb(var(--color-muted))]">Sayfa</th>
                    <th className="px-3 py-2.5 text-center font-bold text-[rgb(var(--color-muted))]">Skor</th>
                    <th className="px-3 py-2.5 text-right font-bold text-[rgb(var(--color-muted))]">FCP</th>
                    <th className="px-3 py-2.5 text-right font-bold text-[rgb(var(--color-muted))]">LCP</th>
                    <th className="px-3 py-2.5 text-right font-bold text-[rgb(var(--color-muted))]">INP</th>
                    <th className="px-3 py-2.5 text-right font-bold text-[rgb(var(--color-muted))]">CLS</th>
                    <th className="px-3 py-2.5 text-right font-bold text-[rgb(var(--color-muted))]">TTFB</th>
                    <th className="px-3 py-2.5 text-right font-bold text-[rgb(var(--color-muted))]">Örnek</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgb(var(--color-border))]">
                  {data?.vitals.map(r => {
                    const badge = scoreBadge(r.score)
                    return (
                      <tr key={r.path} className="hover:bg-[rgb(var(--color-surface))] transition-colors">
                        <td className="px-5 py-3 font-mono text-[rgb(var(--color-text))]">{r.path}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', badge.cls)}>
                            {r.score > 0 ? r.score : '—'}
                          </span>
                        </td>
                        <td className={cn('px-3 py-3 text-right tabular-nums font-semibold',
                          r.fcp > 0 ? (r.fcp <= 1800 ? 'text-emerald-600' : r.fcp <= 3000 ? 'text-amber-600' : 'text-red-600') : 'text-[rgb(var(--color-muted))]')}>
                          {r.fcp > 0 ? `${(r.fcp / 1000).toFixed(2)}s` : '—'}
                        </td>
                        <td className={cn('px-3 py-3 text-right tabular-nums font-semibold',
                          r.lcp > 0 ? (r.lcp <= 2500 ? 'text-emerald-600' : r.lcp <= 4000 ? 'text-amber-600' : 'text-red-600') : 'text-[rgb(var(--color-muted))]')}>
                          {r.lcp > 0 ? `${(r.lcp / 1000).toFixed(2)}s` : '—'}
                        </td>
                        <td className={cn('px-3 py-3 text-right tabular-nums font-semibold',
                          r.inp > 0 ? (r.inp <= 200 ? 'text-emerald-600' : r.inp <= 500 ? 'text-amber-600' : 'text-red-600') : 'text-[rgb(var(--color-muted))]')}>
                          {r.inp > 0 ? `${r.inp}ms` : '—'}
                        </td>
                        <td className={cn('px-3 py-3 text-right tabular-nums font-semibold',
                          r.cls > 0 ? (r.cls / 1000 <= 0.1 ? 'text-emerald-600' : r.cls / 1000 <= 0.25 ? 'text-amber-600' : 'text-red-600') : 'text-[rgb(var(--color-muted))]')}>
                          {r.cls > 0 ? (r.cls / 1000).toFixed(3) : '—'}
                        </td>
                        <td className={cn('px-3 py-3 text-right tabular-nums font-semibold',
                          r.ttfb > 0 ? (r.ttfb <= 800 ? 'text-emerald-600' : r.ttfb <= 1800 ? 'text-amber-600' : 'text-red-600') : 'text-[rgb(var(--color-muted))]')}>
                          {r.ttfb > 0 ? `${r.ttfb}ms` : '—'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums text-[rgb(var(--color-muted))]">{r.samples}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <div className="flex gap-4 border-t border-[rgb(var(--color-border))] px-5 py-2.5 text-[10px]">
                <span className="text-emerald-600">● İyi ≥90</span>
                <span className="text-amber-600">● Orta 50–90</span>
                <span className="text-red-600">● Zayıf &lt;50</span>
                <span className="ml-auto text-[rgb(var(--color-muted))]">FCP · LCP · TTFB saniye · INP milisaniye · CLS birim</span>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
