'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowRight,
  BarChart3,
  Bot,
  Calendar,
  ChevronRight,
  Eye,
  FileText,
  FolderTree,
  Image as ImageIcon,
  MessageSquare,
  Newspaper,
  Settings,
  Sparkles,
  Tag,
  TrendingUp,
  Users,
} from 'lucide-react'
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/Card'
import { DashboardStatCard } from '@/components/admin/DashboardStatCard'
import { DashboardChart } from '@/components/admin/DashboardChart'
import { PopularNewsTable } from '@/components/admin/PopularNewsTable'
import { RecentActivityFeed } from '@/components/admin/RecentActivityFeed'
import { adminService, type DashboardOverview } from '@/services/adminService'
import { ROUTES } from '@/constants/routes'

/**
 * Admin Dashboard v2 — F4
 *
 * Master Product Prompt mock'una uyumlu yeniden tasarım:
 *   - 4 zenginleştirilmiş stat kartı (delta + accent)
 *   - 7 gün yayın grafiği (SVG area chart)
 *   - Popüler haber tablosu
 *   - Aktivite feed
 *   - AI Newsroom + hızlı erişim shortcut'ları
 */
export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    adminService
      .getDashboardOverview()
      .then((d) => {
        if (cancelled) return
        setData(d)
        setUpdatedAt(new Date())
      })
      .catch((err) => console.error('[admin dashboard]', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const weeklyTotal = useMemo(
    () => (data?.publishSeries ?? []).reduce((acc, p) => acc + p.count, 0),
    [data?.publishSeries]
  )

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      {/* ── Başlık ──────────────────────────────────────────── */}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xs font-bold uppercase tracking-widest text-brand-500">
            NaHaber Admin
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-text-primary">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-text-tertiary">
            Genel bakış, son aktiviteler ve içerik istatistikleri
            {updatedAt ? (
              <>
                {' '}
                <span aria-hidden>·</span> Güncellendi:{' '}
                {updatedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
              </>
            ) : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={ROUTES.ADMIN.NEWS}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-bg-card px-3 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-bg-subtle"
          >
            <Newspaper className="h-4 w-4" />
            Tüm Haberler
          </Link>
          <Link
            href={ROUTES.ADMIN.NEWSROOM}
            className="inline-flex items-center gap-1.5 rounded-xl bg-brand-500 px-3 py-2 text-sm font-semibold text-white shadow-brand transition-colors hover:bg-brand-600"
          >
            <Sparkles className="h-4 w-4" />
            AI Newsroom
          </Link>
        </div>
      </header>

      {/* ── Stat kartları ───────────────────────────────────── */}
      <section
        aria-label="Genel istatistikler"
        className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        <DashboardStatCard
          label="Toplam Haber"
          value={data?.stats.totalNews ?? 0}
          icon={Newspaper}
          delta={data ? computeDelta(weeklyTotal, data.stats.totalNews) : null}
          accent="brand"
          loading={loading}
        />
        <DashboardStatCard
          label="Toplam Kullanıcı"
          value={data?.stats.totalUsers ?? 0}
          icon={Users}
          delta={null}
          accent="ekonomi"
          loading={loading}
        />
        <DashboardStatCard
          label="Onay Bekleyen"
          value={data?.stats.pendingNews ?? 0}
          icon={FileText}
          delta={null}
          invertColor
          accent="magazin"
          description="Moderasyon kuyruğu"
          loading={loading}
        />
        <DashboardStatCard
          label="Bekleyen Rapor"
          value={data?.stats.pendingReports ?? 0}
          icon={MessageSquare}
          delta={null}
          invertColor
          accent="spor"
          loading={loading}
        />
      </section>

      {/* ── Chart + Aktivite ────────────────────────────────── */}
      <section className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card surface="elevated" radius="2xl" className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Son 7 Gün Yayın Grafiği</CardTitle>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/10 px-2.5 py-1 text-2xs font-bold text-brand-600 dark:text-brand-300">
                <BarChart3 className="h-3 w-3" />
                {weeklyTotal} haber
              </span>
            </div>
          </CardHeader>
          <CardBody>
            <DashboardChart data={data?.publishSeries ?? []} height={240} />
          </CardBody>
        </Card>

        <RecentActivityFeed
          items={data?.recentActivity ?? []}
          loading={loading}
        />
      </section>

      {/* ── Popüler + AI Newsroom shortcut ──────────────────── */}
      <section className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <PopularNewsTable
            items={data?.topNews ?? []}
            loading={loading}
          />
        </div>

        <Card surface="elevated" radius="2xl" className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-brand-500" />
              AI Newsroom
            </CardTitle>
          </CardHeader>
          <CardBody className="space-y-2">
            <AIShortcut
              href={ROUTES.ADMIN.NEWSROOM}
              icon={<Sparkles className="h-5 w-5" />}
              label="Haber Üret"
              hint="Tek tuşla AI editörlerini çalıştır"
            />
            <AIShortcut
              href="/admin/ai/video"
              icon={<TrendingUp className="h-5 w-5" />}
              label="Video Özet"
              hint="60sn TikTok/Reels script + TTS"
            />
            <AIShortcut
              href="/admin/social"
              icon={<MessageSquare className="h-5 w-5" />}
              label="Sosyal Medya"
              hint="X · Instagram · WhatsApp paylaşımı"
            />
          </CardBody>
        </Card>
      </section>

      {/* ── Hızlı erişim ────────────────────────────────────── */}
      <section aria-label="Hızlı erişim">
        <h2 className="mb-3 text-2xs font-bold uppercase tracking-widest text-text-tertiary">
          Hızlı Erişim
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <QuickLink href={ROUTES.ADMIN.NEWS} icon={Newspaper} label="Haberler" />
          <QuickLink href={ROUTES.ADMIN.CATEGORIES} icon={FolderTree} label="Kategoriler" />
          <QuickLink href="/admin/authors" icon={Users} label="Yazarlar" />
          <QuickLink href={ROUTES.ADMIN.EVENTS} icon={Calendar} label="Etkinlikler" />
          <QuickLink href="/admin/seo" icon={Tag} label="SEO" />
          <QuickLink href={ROUTES.ADMIN.SETTINGS} icon={Settings} label="Ayarlar" />
        </div>
      </section>
    </div>
  )
}

function computeDelta(weeklyAdds: number, total: number): number | null {
  if (total === 0) return null
  // Pseudo-delta: haftalık eklenen / toplam = % değişim
  return (weeklyAdds / Math.max(total, 1)) * 100
}

function AIShortcut({
  href,
  icon,
  label,
  hint,
}: {
  href: string
  icon: React.ReactNode
  label: string
  hint: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-bg-subtle/40 p-3 transition-all hover:border-brand-500/40 hover:bg-brand-500/5"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-500/10 text-brand-500 transition-colors group-hover:bg-brand-500 group-hover:text-white">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-text-primary">{label}</p>
        <p className="line-clamp-1 text-2xs text-text-tertiary">{hint}</p>
      </div>
      <ChevronRight className="h-4 w-4 text-text-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-brand-500" />
    </Link>
  )
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string
  icon: typeof Newspaper
  label: string
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-bg-card p-4 text-center transition-all hover:-translate-y-0.5 hover:border-brand-500/40 hover:shadow-md"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-bg-subtle text-text-secondary transition-colors group-hover:bg-brand-500/10 group-hover:text-brand-500">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-xs font-semibold text-text-primary">{label}</span>
    </Link>
  )
}
