'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import {
  Newspaper, Users, Video, TrendingUp, Clock, CheckCircle2,
  XCircle, AlertTriangle, Zap, BarChart3, Eye, Activity,
  RefreshCw, ArrowUpRight, Bot, Radio,
} from 'lucide-react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { db, Collections } from '@/lib/firebase/firestore'
import {
  collection, query, where, orderBy, limit,
  onSnapshot, getCountFromServer, getDocs,
} from 'firebase/firestore'
import { formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'
import { getCategoryLabel } from '@/lib/newsMapper'
import { cn } from '@/lib/utils'

interface DashStats {
  totalPublished: number
  pendingReview: number
  publishedToday: number
  totalUsers: number
  videoQueue: number
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
}

interface KpiCardProps {
  title: string
  value: number | string
  icon: React.ComponentType<{ className?: string }>
  color: string
  href?: string
  description?: string
  trend?: number
}

function KpiCard({ title, value, icon: Icon, color, href, description, trend }: KpiCardProps) {
  const inner = (
    <div className={cn(
      'group relative overflow-hidden rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-5 transition-all',
      href && 'hover:border-blue-500/40 hover:shadow-md cursor-pointer'
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">{title}</p>
          <p className={cn('mt-1.5 text-3xl font-black tabular-nums tracking-tight', color)}>
            {typeof value === 'number' ? value.toLocaleString('tr-TR') : value}
          </p>
          {description && <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">{description}</p>}
        </div>
        <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-xl', color.replace('text-', 'bg-').replace('-600', '-100').replace('-400', '-100') + ' dark:bg-opacity-20')}>
          <Icon className={cn('h-6 w-6', color)} />
        </div>
      </div>
      {trend !== undefined && (
        <div className={cn('mt-3 flex items-center gap-1 text-xs font-medium', trend >= 0 ? 'text-emerald-600' : 'text-red-500')}>
          <TrendingUp className={cn('h-3 w-3', trend < 0 && 'rotate-180')} />
          <span>{Math.abs(trend)}% bu hafta</span>
        </div>
      )}
      {href && (
        <ArrowUpRight className="absolute right-4 top-4 h-4 w-4 text-[rgb(var(--color-muted))] opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    published: { label: 'Yayında', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' },
    pending_review: { label: 'Bekliyor', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    rejected: { label: 'Reddedildi', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
    draft: { label: 'Taslak', cls: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400' },
  }
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', s.cls)}>{s.label}</span>
}

function ConfidenceDot({ score }: { score?: number }) {
  if (!score) return null
  const color = score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="flex items-center gap-1">
      <span className={cn('h-2 w-2 rounded-full', color)} />
      <span className="text-xs text-[rgb(var(--color-muted))]">{score}</span>
    </div>
  )
}

export default function AdminIndexPage() {
  const { user, role, roleLabel, can } = useCmsAuth()
  const [stats, setStats] = useState<DashStats>({ totalPublished: 0, pendingReview: 0, publishedToday: 0, totalUsers: 0, videoQueue: 0, breakingActive: 0 })
  const [recent, setRecent] = useState<RecentArticle[]>([])
  const [pending, setPending] = useState<RecentArticle[]>([])
  const [loading, setLoading] = useState(true)

  const loadStats = useCallback(async () => {
    try {
      const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0)
      const [publishedSnap, pendingSnap, todaySnap, usersSnap] = await Promise.all([
        getCountFromServer(query(collection(db, Collections.NEWS), where('status', '==', 'published'))).catch(() => null),
        getCountFromServer(query(collection(db, 'newsDrafts'), where('draftStatus', '==', 'pending_review'))).catch(() => null),
        getCountFromServer(query(collection(db, Collections.NEWS), where('status', '==', 'published'), where('createdAt', '>=', startOfDay.getTime()))).catch(() => null),
        getCountFromServer(collection(db, 'users')).catch(() => null),
      ])
      setStats({
        totalPublished: publishedSnap?.data().count ?? 0,
        pendingReview: pendingSnap?.data().count ?? 0,
        publishedToday: todaySnap?.data().count ?? 0,
        totalUsers: usersSnap?.data().count ?? 0,
        videoQueue: 0,
        breakingActive: 0,
      })
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // Live recent articles
  useEffect(() => {
    const q = query(collection(db, Collections.NEWS), orderBy('createdAt', 'desc'), limit(8))
    return onSnapshot(q, snap => {
      setRecent(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          title: (data.title as string) ?? '',
          status: (data.status as string) ?? 'draft',
          source: (data.source as string) ?? '',
          categoryId: (data.categoryId as string) ?? '',
          confidenceScore: data.confidenceScore as number | undefined,
          createdAt: (data.createdAt as number) ?? 0,
        }
      }))
    }, () => {})
  }, [])

  // Live pending queue
  useEffect(() => {
    const q = query(collection(db, 'newsDrafts'), where('draftStatus', '==', 'pending_review'), orderBy('createdAt', 'desc'), limit(5))
    return onSnapshot(q, snap => {
      setPending(snap.docs.map(d => {
        const data = d.data()
        return {
          id: d.id,
          title: (data.title as string) ?? '',
          status: 'pending_review',
          source: (data.source as string) ?? '',
          categoryId: (data.categoryId as string) ?? '',
          confidenceScore: data.confidenceScore as number | undefined,
          createdAt: (data.createdAt as number) ?? 0,
        }
      }))
    }, () => {})
  }, [])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Günaydın' : hour < 18 ? 'İyi öğleden sonralar' : 'İyi akşamlar'
  const firstName = user?.displayName?.split(' ')[0] ?? 'Editör'

  return (
    <div className="flex flex-col">
      <CMSHeader
        title="Dashboard"
        subtitle="NaHaber Newsroom — Kontrol Paneli"
        actions={
          <button onClick={() => { setLoading(true); loadStats() }} className="flex items-center gap-1.5 rounded-lg border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-3 py-2 text-sm text-[rgb(var(--color-muted))] transition-colors hover:text-[rgb(var(--color-text))]">
            <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            Yenile
          </button>
        }
      />

      <div className="p-6 space-y-6">
        {/* Greeting */}
        <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-gradient-to-r from-blue-600 to-blue-800 p-5 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-lg font-black">{greeting}, {firstName} 👋</p>
              <p className="mt-1 text-sm text-blue-200">
                {roleLabel} — {new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <Radio className="h-10 w-10 text-blue-300 opacity-50" />
          </div>
          {stats.pendingReview > 0 && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2">
              <AlertTriangle className="h-4 w-4 text-amber-300" />
              <span className="text-sm font-semibold">
                <strong>{stats.pendingReview}</strong> haber onay bekliyor
              </span>
              <Link href="/admin/news?filter=pending" className="ml-auto text-xs font-bold underline">İncele →</Link>
            </div>
          )}
        </div>

        {/* KPI Grid */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard title="Yayındaki Haberler" value={loading ? '–' : stats.totalPublished} icon={Newspaper} color="text-blue-600" href="/admin/news?filter=published" trend={12} />
          <KpiCard title="Onay Bekleyen" value={loading ? '–' : stats.pendingReview} icon={Clock} color="text-amber-600" href="/admin/news?filter=pending" description="Moderasyon kuyruğu" />
          <KpiCard title="Bugün Yayınlanan" value={loading ? '–' : stats.publishedToday} icon={Zap} color="text-emerald-600" trend={8} />
          <KpiCard title="Toplam Kullanıcı" value={loading ? '–' : stats.totalUsers} icon={Users} color="text-purple-600" href="/admin/users" trend={5} />
        </div>

        {/* Two columns: recent + pending */}
        <div className="grid gap-6 xl:grid-cols-5">
          {/* Recent Articles */}
          <div className="xl:col-span-3">
            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
              <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-600" />
                  <span className="text-sm font-bold text-[rgb(var(--color-text))]">Son Yayınlanan Haberler</span>
                </div>
                <Link href="/admin/news" className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400">Tümü →</Link>
              </div>
              <div className="divide-y divide-[rgb(var(--color-border))]">
                {recent.length === 0 ? (
                  <p className="px-5 py-8 text-center text-sm text-[rgb(var(--color-muted))]">Henüz haber yok</p>
                ) : recent.map(article => (
                  <div key={article.id} className="flex items-start gap-3 px-5 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]">
                    <div className="min-w-0 flex-1">
                      <Link href={`/admin/news/${article.id}/edit`} className="line-clamp-1 text-sm font-semibold text-[rgb(var(--color-text))] hover:text-blue-600">
                        {article.title}
                      </Link>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={article.status} />
                        <span className="text-[10px] text-[rgb(var(--color-muted))]">{getCategoryLabel(article.categoryId)}</span>
                        <span className="text-[10px] text-[rgb(var(--color-muted))]">{article.source}</span>
                        <ConfidenceDot score={article.confidenceScore} />
                      </div>
                    </div>
                    <span className="shrink-0 text-[10px] text-[rgb(var(--color-muted))] whitespace-nowrap">
                      {article.createdAt ? formatDistanceToNow(new Date(article.createdAt), { locale: tr, addSuffix: true }) : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pending Review Queue */}
          <div className="xl:col-span-2 space-y-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/10 overflow-hidden">
              <div className="flex items-center justify-between border-b border-amber-200 dark:border-amber-900/50 px-5 py-3">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-bold text-amber-800 dark:text-amber-300">Onay Kuyruğu</span>
                </div>
                <Link href="/admin/news?filter=pending" className="text-xs font-semibold text-amber-700 hover:underline dark:text-amber-400">Hepsini İncele →</Link>
              </div>
              <div className="divide-y divide-amber-100 dark:divide-amber-900/30">
                {pending.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Kuyruk temiz!</p>
                  </div>
                ) : pending.map(article => (
                  <div key={article.id} className="flex items-start gap-3 px-5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-xs font-semibold text-amber-900 dark:text-amber-200">{article.title}</p>
                      <p className="mt-1 text-[10px] text-amber-600 dark:text-amber-400">{article.source} · {getCategoryLabel(article.categoryId)}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Link href={`/admin/news?filter=pending`} className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-amber-700">İncele</Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick AI Actions */}
            <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] overflow-hidden">
              <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
                <Bot className="h-4 w-4 text-purple-600" />
                <span className="text-sm font-bold text-[rgb(var(--color-text))]">AI Asistan</span>
              </div>
              <div className="p-3 space-y-2">
                {[
                  { href: '/admin/ai/news', label: 'Haber Oluştur', icon: Newspaper, color: 'text-blue-600' },
                  { href: '/admin/ai/news?mode=rewrite', label: 'Haber Yeniden Yaz', icon: RefreshCw, color: 'text-emerald-600' },
                  { href: '/admin/ai/video', label: 'Video Script Oluştur', icon: Video, color: 'text-purple-600' },
                  { href: '/admin/seo', label: 'SEO Analizi Yap', icon: BarChart3, color: 'text-amber-600' },
                ].map(item => (
                  <Link key={item.href} href={item.href} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-[rgb(var(--color-text))] transition-colors hover:bg-[rgb(var(--color-surface))]">
                    <item.icon className={cn('h-4 w-4 shrink-0', item.color)} />
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* System status row */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: 'AI Pipeline', status: 'Aktif', color: 'text-emerald-600', dot: 'bg-emerald-500', href: '/admin/cron' },
            { label: 'Cron Görevleri', status: 'Çalışıyor', color: 'text-blue-600', dot: 'bg-blue-500', href: '/admin/cron' },
            { label: 'SEO Maintenance', status: 'Güncel', color: 'text-purple-600', dot: 'bg-purple-500', href: '/admin/seo' },
          ].map(item => (
            <Link key={item.label} href={item.href} className="flex items-center gap-3 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] px-4 py-3 transition-colors hover:bg-[rgb(var(--color-surface))]">
              <span className={cn('h-2.5 w-2.5 rounded-full', item.dot)} />
              <span className="text-sm font-semibold text-[rgb(var(--color-text))]">{item.label}</span>
              <span className={cn('ml-auto text-xs font-bold', item.color)}>{item.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
