'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Newspaper, Users, Clock, CheckCircle2, AlertTriangle, Zap,
  BarChart3, Activity, Bot, ArrowUpRight, Eye,
} from 'lucide-react'
import { CMSHeader, CMSRefreshButton } from '@/components/admin/CMSHeader'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { MobileHome } from '@/components/admin/mobile/MobileHome'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { useIsMobileAdminViewport } from '@/hooks/useIsMobileAdminViewport'
import { db, Collections } from '@/lib/firebase/firestore'
import {
  collection, query, where, orderBy, limit, onSnapshot, getCountFromServer,
} from 'firebase/firestore'
import { formatDistanceToNow, format } from 'date-fns'
import { tr } from 'date-fns/locale'
import { getCategoryLabel } from '@/lib/newsMapper'
import { cn } from '@/lib/utils'
import { DashboardChart } from '@/components/admin/DashboardChart'
import { PopularNewsTable } from '@/components/admin/PopularNewsTable'
import { adminService, type DashboardOverview } from '@/services/adminService'

let _pageStatsCache: { data: DashStats; t: number } | null = null
const PAGE_STATS_TTL = 5 * 60 * 1000

function tsToMs(val: unknown): number {
  if (typeof val === 'number') return val
  if (val && typeof val === 'object' && 'toMillis' in val) return (val as { toMillis(): number }).toMillis()
  if (val && typeof val === 'object' && 'seconds' in val) return (val as { seconds: number }).seconds * 1000
  return 0
}

interface DashStats {
  totalPublished: number
  pendingReview: number
  publishedToday: number
  totalUsers: number
  breakingActive: number
}

interface RecentArticle {
  id: string
  title: string
  status: string
  source: string
  categoryId: string
  confidenceScore?: number
  createdAt: number
  kind?: 'published' | 'pending' | 'breaking'
}

interface LiveEvent {
  id: string
  title: string
  source: string
  categoryId: string
  createdAt: number
  kind: 'pending' | 'published' | 'breaking'
  href: string
}

function KpiCard({
  title,
  value,
  icon: Icon,
  href,
  description,
  tone = 'neutral',
}: {
  title: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  href?: string
  description?: string
  tone?: 'neutral' | 'warning' | 'success' | 'danger'
}) {
  const tones = {
    neutral: 'text-[rgb(var(--color-text))]',
    warning: 'text-amber-600 dark:text-amber-400',
    success: 'text-emerald-600 dark:text-emerald-400',
    danger: 'text-red-600 dark:text-red-400',
  }
  const iconBg = {
    neutral: 'bg-[rgb(var(--color-surface))] text-[rgb(var(--color-muted))]',
    warning: 'bg-amber-500/10 text-amber-600',
    success: 'bg-emerald-500/10 text-emerald-600',
    danger: 'bg-red-500/10 text-red-600',
  }
  const inner = (
    <div
      className={cn(
        'group relative rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 transition-colors',
        href && 'hover:border-[rgb(var(--color-brand))]/25'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
            {title}
          </p>
          <p className={cn('admin-kpi-value mt-1.5', tones[tone])}>
            {typeof value === 'number' ? value.toLocaleString('tr-TR') : value}
          </p>
          {description ? <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">{description}</p> : null}
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconBg[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {href ? (
        <ArrowUpRight className="absolute right-3 top-3 h-3.5 w-3.5 text-[rgb(var(--color-muted))] opacity-0 transition-opacity group-hover:opacity-100" />
      ) : null}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function ConfidenceDot({ score }: { score?: number }) {
  if (!score) return null
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1" title={`Güven skoru: ${score}`}>
      <span className={cn('h-1.5 w-1.5 rounded-full', color)} />
      <span className="text-[10px] tabular-nums text-[rgb(var(--color-muted))]">{score}</span>
    </div>
  )
}

export default function AdminIndexPage() {
  const isMobile = useIsMobileAdminViewport()
  const { user, roleLabel, can } = useCmsAuth()
  const [stats, setStats] = useState<DashStats>({
    totalPublished: 0,
    pendingReview: 0,
    publishedToday: 0,
    totalUsers: 0,
    breakingActive: 0,
  })
  const [recent, setRecent] = useState<RecentArticle[]>([])
  const [pending, setPending] = useState<RecentArticle[]>([])
  const [breaking, setBreaking] = useState<RecentArticle[]>([])
  const [loading, setLoading] = useState(true)
  const [overview, setOverview] = useState<DashboardOverview | null>(null)

  const loadStats = useCallback(async () => {
    if (isMobile !== false) return
    if (_pageStatsCache && Date.now() - _pageStatsCache.t < PAGE_STATS_TTL) {
      setStats(_pageStatsCache.data)
      setLoading(false)
      return
    }
    try {
      const startOfDay = new Date()
      startOfDay.setHours(0, 0, 0, 0)
      const [publishedSnap, pendingSnap, todaySnap, usersSnap, breakingSnap] = await Promise.all([
        getCountFromServer(query(collection(db, Collections.NEWS), where('status', '==', 'published'))).catch(() => null),
        getCountFromServer(query(collection(db, 'newsDrafts'), where('draftStatus', '==', 'pending_review'))).catch(() => null),
        getCountFromServer(
          query(
            collection(db, Collections.NEWS),
            where('status', '==', 'published'),
            where('createdAt', '>=', startOfDay.getTime())
          )
        ).catch(() => null),
        getCountFromServer(collection(db, 'users')).catch(() => null),
        getCountFromServer(
          query(collection(db, Collections.NEWS), where('isBreaking', '==', true), where('status', '==', 'published'))
        ).catch(() => null),
      ])
      const newStats: DashStats = {
        totalPublished: publishedSnap?.data().count ?? 0,
        pendingReview: pendingSnap?.data().count ?? 0,
        publishedToday: todaySnap?.data().count ?? 0,
        totalUsers: usersSnap?.data().count ?? 0,
        breakingActive: breakingSnap?.data().count ?? 0,
      }
      _pageStatsCache = { data: newStats, t: Date.now() }
      setStats(newStats)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [isMobile])

  useEffect(() => {
    if (isMobile !== false) return
    void loadStats()
  }, [loadStats, isMobile])

  useEffect(() => {
    if (isMobile !== false) return
    let cancelled = false
    adminService
      .getDashboardOverview()
      .then((d) => {
        if (!cancelled) setOverview(d)
      })
      .catch((e) => console.error('[admin overview]', e))
    return () => {
      cancelled = true
    }
  }, [isMobile])

  useEffect(() => {
    if (isMobile !== false) return
    const q = query(collection(db, Collections.NEWS), orderBy('createdAt', 'desc'), limit(10))
    return onSnapshot(
      q,
      (snap) => {
        setRecent(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              title: (data.title as string) ?? '',
              status: (data.status as string) ?? 'draft',
              source: (data.source as string) ?? '',
              categoryId: (data.categoryId as string) ?? '',
              confidenceScore: data.confidenceScore as number | undefined,
              createdAt: tsToMs(data.createdAt),
              kind: 'published' as const,
            }
          })
        )
      },
      () => {}
    )
  }, [isMobile])

  useEffect(() => {
    if (isMobile !== false) return
    const q = query(
      collection(db, 'newsDrafts'),
      where('draftStatus', '==', 'pending_review'),
      orderBy('createdAt', 'desc'),
      limit(8)
    )
    return onSnapshot(
      q,
      (snap) => {
        setPending(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              title: (data.title as string) ?? '',
              status: 'pending_review',
              source: (data.source as string) ?? '',
              categoryId: (data.categoryId as string) ?? '',
              confidenceScore: data.confidenceScore as number | undefined,
              createdAt: tsToMs(data.createdAt),
              kind: 'pending' as const,
            }
          })
        )
      },
      () => {}
    )
  }, [isMobile])

  useEffect(() => {
    if (isMobile !== false) return
    const q = query(
      collection(db, Collections.NEWS),
      where('isBreaking', '==', true),
      where('status', '==', 'published'),
      orderBy('createdAt', 'desc'),
      limit(5)
    )
    return onSnapshot(
      q,
      (snap) => {
        setBreaking(
          snap.docs.map((d) => {
            const data = d.data()
            return {
              id: d.id,
              title: (data.title as string) ?? '',
              status: 'published',
              source: (data.source as string) ?? '',
              categoryId: (data.categoryId as string) ?? '',
              createdAt: tsToMs(data.createdAt),
              kind: 'breaking' as const,
            }
          })
        )
      },
      () => setBreaking([])
    )
  }, [isMobile])

  const liveEvents = useMemo(() => {
    const events: LiveEvent[] = [
      ...pending.map((a) => ({
        id: `p-${a.id}`,
        title: a.title,
        source: a.source,
        categoryId: a.categoryId,
        createdAt: a.createdAt,
        kind: 'pending' as const,
        href: '/admin/news?filter=pending',
      })),
      ...breaking.map((a) => ({
        id: `b-${a.id}`,
        title: a.title,
        source: a.source,
        categoryId: a.categoryId,
        createdAt: a.createdAt,
        kind: 'breaking' as const,
        href: `/admin/news/${a.id}/edit`,
      })),
      ...recent
        .filter((a) => a.status === 'published')
        .slice(0, 6)
        .map((a) => ({
          id: `r-${a.id}`,
          title: a.title,
          source: a.source,
          categoryId: a.categoryId,
          createdAt: a.createdAt,
          kind: 'published' as const,
          href: `/admin/news/${a.id}/edit`,
        })),
    ]
    return events.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10)
  }, [pending, breaking, recent])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi günler' : 'İyi akşamlar'
  const firstName = user?.displayName?.split(' ')[0] ?? 'Editör'
  const todayLabel = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  if (isMobile === null) {
    return <div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>
  }

  if (isMobile) {
    return <MobileHome />
  }

  return (
    <div className="flex flex-col admin-shell">
      <CMSHeader
        title="Dashboard"
        subtitle="Haber odası kontrol merkezi"
        actions={
          <CMSRefreshButton
            loading={loading}
            onClick={() => {
              _pageStatsCache = null
              setLoading(true)
              void loadStats()
            }}
          />
        }
      />

      <div className="space-y-5 p-4 sm:p-6">
        {/* Newsroom status — calm, operational */}
        <section className="rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-xl font-bold tracking-tight text-[rgb(var(--color-text))]">
                {greeting}, {firstName}
              </p>
              <p className="mt-1 text-sm capitalize text-[rgb(var(--color-muted))]">
                {roleLabel} · {todayLabel}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Canlı yayın aktif
                </span>
                {stats.breakingActive > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:text-red-300">
                    <Zap className="h-3 w-3" />
                    {stats.breakingActive} son dakika
                  </span>
                ) : null}
                {stats.pendingReview > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3 w-3" />
                    {stats.pendingReview} onay bekliyor
                  </span>
                ) : null}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href="/admin/news?filter=pending"
                className="inline-flex items-center justify-center rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                Onay Kuyruğunu Aç
              </Link>
              {can('news:create') ? (
                <Link
                  href="/admin/news/create"
                  className="inline-flex items-center justify-center rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-2.5 text-sm font-semibold text-[rgb(var(--color-text))] hover:bg-[rgb(var(--color-surface))]"
                >
                  Yeni Haber
                </Link>
              ) : null}
            </div>
          </div>
        </section>

        {/* KPI strip — no fake trends */}
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <KpiCard
            title="Yayındaki Haberler"
            value={loading ? '–' : stats.totalPublished}
            icon={Newspaper}
            href="/admin/news?filter=published"
          />
          <KpiCard
            title="Onay Bekleyen"
            value={loading ? '–' : stats.pendingReview}
            icon={Clock}
            href="/admin/news?filter=pending"
            description="Moderasyon kuyruğu"
            tone={stats.pendingReview > 0 ? 'warning' : 'neutral'}
          />
          <KpiCard
            title="Bugün Yayınlanan"
            value={loading ? '–' : stats.publishedToday}
            icon={Zap}
            tone="success"
          />
          <KpiCard
            title="Toplam Kullanıcı"
            value={loading ? '–' : stats.totalUsers}
            icon={Users}
            href={can('users:read') ? '/admin/users' : undefined}
          />
          <KpiCard
            title="81 İl SMM"
            value="0/81"
            icon={Bot}
            href={can('social:view') ? '/admin/smm' : undefined}
            description="Henüz seed edilmedi"
            tone="neutral"
          />
          <KpiCard
            title="Canlı Merkez"
            value={loading ? '–' : liveEvents.length}
            icon={Activity}
            href="/admin/live-center"
            description="Anlık sinyal"
          />
        </section>

        {/* Live newsroom + Approval queue */}
        <section className="grid gap-5 xl:grid-cols-5">
          <div className="xl:col-span-3">
            <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
              <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-[rgb(var(--color-brand))]" />
                  <h2 className="admin-section-title">Canlı Haber Merkezi</h2>
                </div>
                <span className="text-[11px] font-medium text-[rgb(var(--color-muted))]">Anlık</span>
              </div>
              <div className="divide-y divide-[rgb(var(--color-border))]">
                {liveEvents.length === 0 ? (
                  <p className="px-5 py-10 text-center text-sm text-[rgb(var(--color-muted))]">
                    Şu an canlı sinyal yok.
                  </p>
                ) : (
                  liveEvents.map((ev) => (
                    <Link
                      key={ev.id}
                      href={ev.href}
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[rgb(var(--color-surface))] sm:px-5"
                    >
                      <span className="mt-0.5 w-11 shrink-0 text-[11px] font-semibold tabular-nums text-[rgb(var(--color-muted))]">
                        {ev.createdAt ? format(new Date(ev.createdAt), 'HH:mm') : '—'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5">
                          <AdminStatusBadge
                            status={
                              ev.kind === 'breaking' ? 'breaking' : ev.kind === 'pending' ? 'pending_review' : 'published'
                            }
                          />
                          <span className="admin-meta">{getCategoryLabel(ev.categoryId)}</span>
                        </div>
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--color-text))]">
                          {ev.title}
                        </p>
                        {ev.source ? <p className="mt-1 admin-meta">Kaynak: {ev.source}</p> : null}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="xl:col-span-2">
            <div className="overflow-hidden rounded-[14px] border border-amber-500/20 bg-[rgb(var(--color-card))]">
              <div className="flex items-center justify-between border-b border-amber-500/15 bg-amber-500/[0.04] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <h2 className="admin-section-title">Onay Kuyruğu</h2>
                  {stats.pendingReview > 0 ? (
                    <span className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                      {stats.pendingReview}
                    </span>
                  ) : null}
                </div>
                <Link
                  href="/admin/news?filter=pending"
                  className="text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400"
                >
                  Tümü →
                </Link>
              </div>
              <div className="divide-y divide-[rgb(var(--color-border))]">
                {pending.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                    <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                    <p className="text-sm font-semibold text-[rgb(var(--color-text))]">
                      Onay bekleyen haber bulunmuyor.
                    </p>
                  </div>
                ) : (
                  pending.map((article) => (
                    <div key={article.id} className="flex items-start gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-semibold text-[rgb(var(--color-text))]">
                          {article.title}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                          <span className="admin-meta">{article.source || 'Kaynak yok'}</span>
                          <span className="admin-meta">{getCategoryLabel(article.categoryId)}</span>
                          <ConfidenceDot score={article.confidenceScore} />
                          <span className="admin-meta">
                            {article.createdAt
                              ? formatDistanceToNow(new Date(article.createdAt), { locale: tr, addSuffix: true })
                              : ''}
                          </span>
                        </div>
                      </div>
                      <Link
                        href="/admin/news?filter=pending"
                        className="shrink-0 rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-700"
                      >
                        İncele
                      </Link>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Latest published + AI shortcuts */}
        <section className="grid gap-5 xl:grid-cols-5">
          <div className="xl:col-span-3">
            <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
              <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-3 sm:px-5">
                <div className="flex items-center gap-2">
                  <Newspaper className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                  <h2 className="admin-section-title">Son Haberler</h2>
                </div>
                <Link
                  href="/admin/news"
                  className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
                >
                  Tümü →
                </Link>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-[rgb(var(--color-border))] text-[11px] uppercase tracking-wide text-[rgb(var(--color-muted))]">
                      <th className="px-4 py-2.5 font-semibold sm:px-5">Başlık</th>
                      <th className="px-2 py-2.5 font-semibold">Durum</th>
                      <th className="px-2 py-2.5 font-semibold">Kategori</th>
                      <th className="px-2 py-2.5 font-semibold">Kaynak</th>
                      <th className="px-4 py-2.5 font-semibold sm:px-5">Zaman</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgb(var(--color-border))]">
                    {recent.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-5 py-10 text-center text-[rgb(var(--color-muted))]">
                          Henüz haber yok.
                        </td>
                      </tr>
                    ) : (
                      recent.map((article) => (
                        <tr key={article.id} className="group hover:bg-[rgb(var(--color-surface))]">
                          <td className="max-w-[280px] px-4 py-3 sm:px-5">
                            <Link
                              href={`/admin/news/${article.id}/edit`}
                              className="line-clamp-2 font-semibold text-[rgb(var(--color-text))] group-hover:text-[rgb(var(--color-brand))]"
                            >
                              {article.title}
                            </Link>
                          </td>
                          <td className="px-2 py-3">
                            <AdminStatusBadge status={article.status} />
                          </td>
                          <td className="px-2 py-3 admin-meta whitespace-nowrap">
                            {getCategoryLabel(article.categoryId)}
                          </td>
                          <td className="px-2 py-3 admin-meta whitespace-nowrap">{article.source || '—'}</td>
                          <td className="px-4 py-3 admin-meta whitespace-nowrap sm:px-5">
                            {article.createdAt
                              ? formatDistanceToNow(new Date(article.createdAt), { locale: tr, addSuffix: true })
                              : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="space-y-5 xl:col-span-2">
            <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
              <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
                <Bot className="h-4 w-4 text-violet-600" />
                <h2 className="admin-section-title">AI Hızlı Erişim</h2>
              </div>
              <div className="space-y-1 p-2">
                {(
                  [
                    { href: '/admin/ai-org', label: 'AI Organizasyonu', perm: 'agents:manage' as const },
                    { href: '/admin/ai-editors', label: 'AI Editörler', perm: 'ai:use' as const },
                    { href: '/admin/ai-tasks', label: 'AI Görevler', perm: 'ai:use' as const },
                    { href: '/admin/smm', label: '81 İl SMM', perm: 'social:view' as const },
                    { href: '/admin/newsroom', label: 'AI Newsroom', perm: 'ai:use' as const },
                    { href: '/admin/ai/news', label: 'Haber Oluştur / Yeniden Yaz', perm: 'ai:use' as const },
                    { href: '/admin/seo', label: 'SEO Kontrolü', perm: 'seo:read' as const },
                    { href: '/admin/inbox', label: 'Gelen Kutusu (Gmail)', perm: 'news:read' as const },
                  ] as const
                )
                  .filter((item) => can(item.perm))
                  .map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface))]"
                    >
                      {item.label}
                      <ArrowUpRight className="h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
                    </Link>
                  ))}
              </div>
            </div>

            <PopularNewsTable items={overview?.topNews ?? []} loading={!overview} />
          </div>
        </section>

        {/* Newsroom OS — görev & hızlı işlemler */}
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <div className="border-b border-[rgb(var(--color-border))] px-5 py-3">
              <h2 className="admin-section-title">Görev & Onay Merkezi</h2>
            </div>
            <div className="divide-y divide-[rgb(var(--color-border))]">
              {[
                { label: 'Onay bekleyen haber', value: stats.pendingReview, href: '/admin/approvals' },
                { label: 'AI görev kuyruğu', value: 0, href: '/admin/ai-tasks' },
                { label: 'SMM paylaşım kuyruğu', value: 0, href: '/admin/smm/queue' },
                { label: 'Öğrenme önerileri', value: 0, href: '/admin/ai-learning' },
                { label: 'Algoritma önerileri', value: 0, href: '/admin/feed-algorithm' },
              ].map((row) => (
                <Link
                  key={row.href}
                  href={row.href}
                  className="flex items-center justify-between px-5 py-3 text-sm hover:bg-[rgb(var(--color-surface))]"
                >
                  <span className="font-medium text-[rgb(var(--color-text))]">{row.label}</span>
                  <span className="rounded-full bg-[rgb(var(--color-brand))]/15 px-2 py-0.5 text-xs font-bold tabular-nums text-[rgb(var(--color-brand))]">
                    {row.value}
                  </span>
                </Link>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
            <div className="border-b border-[rgb(var(--color-border))] px-5 py-3">
              <h2 className="admin-section-title">Hızlı İşlemler</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
              {[
                { href: '/admin/news/create', label: 'Yeni Haber', show: can('news:create') },
                { href: '/admin/inbox', label: 'Gelen Haberler', show: can('news:read') },
                { href: '/admin/ai-editors', label: 'AI Editörler', show: can('ai:use') },
                { href: '/admin/smm', label: '81 İl SMM', show: can('social:view') },
                { href: '/admin/smm/queue', label: 'Paylaşım Kuyruğu', show: can('social:view') },
                { href: '/admin/locations', label: '81 İl', show: can('locations:manage') },
                { href: '/admin/feed-algorithm', label: 'Algoritma', show: can('algorithm:view') },
                { href: '/admin/system-health', label: 'Sistem', show: can('system:settings') },
                { href: '/admin/settings', label: 'Ayarlar', show: can('system:settings') },
              ]
                .filter((x) => x.show)
                .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-4 text-center text-xs font-semibold text-[rgb(var(--color-text))] hover:border-[rgb(var(--color-brand))]/40"
                  >
                    {item.label}
                  </Link>
                ))}
            </div>
          </div>
        </section>

        {/* Performance */}
        <section className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-3">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-[rgb(var(--color-muted))]" />
              <h2 className="admin-section-title">Son 7 Gün Yayın</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-[rgb(var(--color-muted))]">
                {(overview?.publishSeries ?? []).reduce((a, p) => a + p.count, 0)} haber
              </span>
              {can('analytics:read') ? (
                <Link href="/admin/analytics" className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline">
                  Analitik →
                </Link>
              ) : null}
            </div>
          </div>
          <div className="p-5">
            <DashboardChart data={overview?.publishSeries ?? []} height={200} />
          </div>
        </section>

        {/* Honest system links — no fake health claims */}
        <section className="grid gap-3 sm:grid-cols-3">
          {[
            { label: 'Cron İzleme', href: '/admin/cron', perm: 'cron:read' as const, icon: Clock },
            { label: 'SEO Yönetimi', href: '/admin/seo', perm: 'seo:read' as const, icon: Eye },
            { label: 'Gelen Kutusu', href: '/admin/inbox', perm: 'news:read' as const, icon: Activity },
          ]
            .filter((item) => can(item.perm))
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-center gap-3 rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]"
              >
                <item.icon className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{item.label}</span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-[rgb(var(--color-muted))]" />
              </Link>
            ))}
        </section>
      </div>
    </div>
  )
}
