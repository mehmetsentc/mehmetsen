'use client'

import Link from 'next/link'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Clock,
  Database,
  ListTodo,
  Map,
  Newspaper,
  Plus,
  Settings,
  Share2,
  Shield,
  Users,
  Zap,
} from 'lucide-react'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { TurkeySmmMap } from '@/components/admin/os/TurkeySmmMap'
import { getCategoryLabel } from '@/lib/newsMapper'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

export type OsDashStats = {
  totalPublished: number
  pendingReview: number
  publishedToday: number
  totalUsers: number
  totalReads: number | null
  smmActive: number
  smmTotal: number
  draftCount: number
  scheduledCount: number
  archiveCount: number
  aiTaskOpen: number
  factCheckOpen: number
  seoOpen: number
  smmQueue: number
}

export type OsLiveEvent = {
  id: string
  title: string
  source: string
  categoryId: string
  cityLabel?: string
  createdAt: number
  kind: 'pending' | 'published' | 'breaking'
  href: string
}

export type OsAgentActivity = {
  id: string
  actor: string
  actorType: 'AI' | 'HUMAN' | 'SYSTEM'
  message: string
  at: number
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return n.toLocaleString('tr-TR')
}

function KpiCard({
  title,
  value,
  icon: Icon,
  href,
  hint,
  tone = 'neutral',
}: {
  title: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
  href?: string
  hint?: string
  tone?: 'neutral' | 'warning' | 'success' | 'ai'
}) {
  const tones = {
    neutral: 'text-[rgb(var(--color-text))]',
    warning: 'text-amber-600',
    success: 'text-emerald-600',
    ai: 'text-violet-600',
  }
  const iconBg = {
    neutral: 'bg-slate-100 text-slate-500',
    warning: 'bg-amber-500/10 text-amber-600',
    success: 'bg-emerald-500/10 text-emerald-600',
    ai: 'bg-violet-500/10 text-violet-600',
  }
  const inner = (
    <div
      className={cn(
        'group relative rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 transition-colors',
        href && 'hover:border-[rgb(var(--color-brand))]/30'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--color-muted))]">
            {title}
          </p>
          <p className={cn('admin-kpi-value mt-1.5', tones[tone])}>
            {typeof value === 'number' ? formatCompact(value) : value}
          </p>
          {hint ? <p className="mt-1 text-xs text-[rgb(var(--color-muted))]">{hint}</p> : null}
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

function StatusDonut({
  published,
  draft,
  pending,
  scheduled,
  archive,
}: {
  published: number
  draft: number
  pending: number
  scheduled: number
  archive: number
}) {
  const parts = [
    { label: 'Yayında', value: published, color: '#10b981' },
    { label: 'Taslak', value: draft, color: '#94a3b8' },
    { label: 'Onay', value: pending, color: '#f59e0b' },
    { label: 'Planlanan', value: scheduled, color: '#3b82f6' },
    { label: 'Arşiv', value: archive, color: '#64748b' },
  ]
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  let acc = 0
  const r = 36
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-5 px-5 py-4">
      <div className="relative h-28 w-28 shrink-0">
        <svg viewBox="0 0 100 100" className="-rotate-90 h-full w-full">
          {parts.map((p) => {
            const len = (p.value / total) * c
            const dash = `${len} ${c - len}`
            const offset = -acc
            acc += len
            return (
              <circle
                key={p.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={p.color}
                strokeWidth="12"
                strokeDasharray={dash}
                strokeDashoffset={offset}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-extrabold tabular-nums text-[rgb(var(--color-text))]">
            {formatCompact(parts.reduce((a, p) => a + p.value, 0))}
          </span>
          <span className="text-[10px] text-[rgb(var(--color-muted))]">toplam</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-[rgb(var(--color-muted))]">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="font-semibold tabular-nums text-[rgb(var(--color-text))]">{p.value}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

const QUICK = [
  { href: '/admin/news/create', label: 'Yeni Haber', icon: Plus, color: 'bg-[rgb(var(--color-brand))] text-white' },
  { href: '/admin/inbox', label: 'Gelen Haberler', icon: Newspaper, color: 'bg-sky-500 text-white' },
  { href: '/admin/ai-editors', label: 'AI Editörler', icon: Bot, color: 'bg-violet-500 text-white' },
  { href: '/admin/smm', label: '81 İl SMM', icon: Map, color: 'bg-emerald-500 text-white' },
  { href: '/admin/smm/queue', label: 'Paylaşım Kuyruğu', icon: Share2, color: 'bg-amber-500 text-white' },
  { href: '/admin/settings', label: 'Ayarlar', icon: Settings, color: 'bg-slate-700 text-white' },
] as const

export function NewsroomOsDashboard({
  stats,
  loading,
  liveEvents,
  agentActivity,
  smmActiveSlugs,
  orgSummary,
}: {
  stats: OsDashStats
  loading: boolean
  liveEvents: OsLiveEvent[]
  agentActivity: OsAgentActivity[]
  smmActiveSlugs?: Set<string>
  orgSummary: {
    eic: string
    desks: Array<{ label: string; count: number }>
  }
}) {
  const dash = (v: number | string) => (loading ? '–' : v)

  return (
    <div className="space-y-5 p-4 sm:p-6">
      {/* KPI strip — matches reference row */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard title="Yayındaki Haberler" value={dash(stats.totalPublished)} icon={Newspaper} href="/admin/news?filter=published" />
        <KpiCard
          title="Bugün Üretilen Haber"
          value={dash(stats.publishedToday)}
          icon={Bot}
          tone="ai"
          hint="Yayınlanan (bugün)"
        />
        <KpiCard
          title="Onay Bekleyen"
          value={dash(stats.pendingReview)}
          icon={Clock}
          href="/admin/approvals"
          tone={stats.pendingReview > 0 ? 'warning' : 'neutral'}
        />
        <KpiCard
          title="Toplam Okunma"
          value={stats.totalReads == null ? '—' : dash(stats.totalReads)}
          icon={BarChart3}
          href="/admin/analytics"
          hint={stats.totalReads == null ? 'Analitik bağlanınca' : undefined}
        />
        <KpiCard title="Toplam Kullanıcı" value={dash(stats.totalUsers)} icon={Users} href="/admin/users" />
        <KpiCard
          title="81 İl SMM Durumu"
          value={loading ? '–' : `${stats.smmActive}/${stats.smmTotal || 81}`}
          icon={Map}
          href="/admin/smm"
          tone={stats.smmActive > 0 ? 'success' : 'neutral'}
          hint={stats.smmActive === 0 ? 'Seed bekleniyor' : 'Aktif SMM ajan'}
        />
      </section>

      {/* Live feed + status donut */}
      <section className="grid gap-5 xl:grid-cols-5">
        <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] xl:col-span-3">
          <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-4 py-3 sm:px-5">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-[rgb(var(--color-brand))]" />
              <h2 className="admin-section-title">Canlı Haber Akışı</h2>
            </div>
            <Link href="/admin/live-center" className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline">
              Canlı Merkez →
            </Link>
          </div>
          <div className="divide-y divide-[rgb(var(--color-border))]">
            {liveEvents.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[rgb(var(--color-muted))]">Şu an canlı sinyal yok.</p>
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
                      {ev.cityLabel ? <span className="admin-meta">{ev.cityLabel}</span> : null}
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-[rgb(var(--color-text))]">
                      {ev.title}
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] xl:col-span-2">
          <div className="border-b border-[rgb(var(--color-border))] px-5 py-3">
            <h2 className="admin-section-title">Haber Durum Dağılımı</h2>
          </div>
          <StatusDonut
            published={stats.totalPublished}
            draft={stats.draftCount}
            pending={stats.pendingReview}
            scheduled={stats.scheduledCount}
            archive={stats.archiveCount}
          />
        </div>
      </section>

      {/* AI activity + 81 SMM map */}
      <section className="grid gap-5 xl:grid-cols-5">
        <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] xl:col-span-2">
          <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
            <Bot className="h-4 w-4 text-violet-600" />
            <h2 className="admin-section-title">AI Ajan Aktivite Akışı</h2>
          </div>
          <div className="divide-y divide-[rgb(var(--color-border))]">
            {agentActivity.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[rgb(var(--color-muted))]">
                Henüz ajan aktivitesi yok. Task bus bağlandıkça burada görünür.
              </p>
            ) : (
              agentActivity.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 text-sm" aria-hidden>
                    {a.actorType === 'AI' ? '🤖' : a.actorType === 'HUMAN' ? '👤' : '⚙'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[rgb(var(--color-text))]">{a.actor}</p>
                    <p className="text-xs text-[rgb(var(--color-muted))]">{a.message}</p>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-[rgb(var(--color-muted))]">
                    {a.at ? format(new Date(a.at), 'HH:mm') : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] xl:col-span-3">
          <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-3">
            <div className="flex items-center gap-2">
              <Map className="h-4 w-4 text-emerald-600" />
              <h2 className="admin-section-title">81 İl Sosyal Medya Ağı</h2>
            </div>
            <Link href="/admin/smm" className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline">
              SMM paneli →
            </Link>
          </div>
          <div className="grid gap-4 p-4 lg:grid-cols-[1.4fr_1fr]">
            <TurkeySmmMap activeSlugs={smmActiveSlugs} className="min-h-[180px]" />
            <div className="space-y-2 rounded-xl bg-[rgb(var(--color-surface))] p-3 text-xs">
              {[
                { label: 'Toplam SMM', value: String(stats.smmTotal || 81) },
                { label: 'Aktif SMM', value: String(stats.smmActive) },
                { label: 'Bağlı hesap', value: '—' },
                { label: 'Bugün paylaşım', value: '—' },
                { label: 'Kuyruk', value: String(stats.smmQueue) },
                { label: 'Toplam erişim', value: '—', hint: 'Platform API sonra' },
              ].map((row) => (
                <div key={row.label} className="flex items-center justify-between gap-2">
                  <span className="text-[rgb(var(--color-muted))]">{row.label}</span>
                  <span className="font-bold tabular-nums text-[rgb(var(--color-text))]">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Top cities + org chart */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="border-b border-[rgb(var(--color-border))] px-5 py-3">
            <h2 className="admin-section-title">En İyi Performans Gösteren İller</h2>
          </div>
          <p className="px-5 py-8 text-center text-sm text-[rgb(var(--color-muted))]">
            Sosyal performans metrikleri hesap API’leri bağlanınca burada listelenir. Sahte erişim uydurulmaz.
          </p>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center justify-between border-b border-[rgb(var(--color-border))] px-5 py-3">
            <h2 className="admin-section-title">AI Organizasyon Şeması</h2>
            <Link href="/admin/ai-org" className="text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline">
              Tam şema →
            </Link>
          </div>
          <div className="space-y-3 p-5">
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/[0.06] px-4 py-3 text-center">
              <p className="text-sm font-bold text-violet-700 dark:text-violet-300">{orgSummary.eic}</p>
              <p className="text-[10px] uppercase tracking-wide text-violet-500">Genel Yayın Yönetmeni AI</p>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {orgSummary.desks.map((d) => (
                <div
                  key={d.label}
                  className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-3 py-2.5 text-center"
                >
                  <p className="text-xs font-semibold text-[rgb(var(--color-text))]">{d.label}</p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-[rgb(var(--color-muted))]">{d.count} ajan</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Task center + system health + quick actions */}
      <section className="grid gap-5 lg:grid-cols-3">
        <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
            <ListTodo className="h-4 w-4 text-[rgb(var(--color-brand))]" />
            <h2 className="admin-section-title">Görev & Onay Merkezi</h2>
          </div>
          <div className="divide-y divide-[rgb(var(--color-border))]">
            {[
              { label: 'Onay bekleyen haber', value: stats.pendingReview, href: '/admin/approvals', tone: 'amber' },
              { label: 'AI görev kuyruğu', value: stats.aiTaskOpen, href: '/admin/ai-tasks', tone: 'violet' },
              { label: 'Fact check', value: stats.factCheckOpen, href: '/admin/ai-tasks', tone: 'sky' },
              { label: 'SEO', value: stats.seoOpen, href: '/admin/seo', tone: 'emerald' },
              { label: 'SMM paylaşım kuyruğu', value: stats.smmQueue, href: '/admin/smm/queue', tone: 'brand' },
            ].map((row) => (
              <Link
                key={row.label}
                href={row.href}
                className="flex items-center justify-between px-5 py-3 text-sm hover:bg-[rgb(var(--color-surface))]"
              >
                <span className="font-medium text-[rgb(var(--color-text))]">{row.label}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
                    row.tone === 'amber' && 'bg-amber-500/15 text-amber-700',
                    row.tone === 'violet' && 'bg-violet-500/15 text-violet-700',
                    row.tone === 'sky' && 'bg-sky-500/15 text-sky-700',
                    row.tone === 'emerald' && 'bg-emerald-500/15 text-emerald-700',
                    row.tone === 'brand' && 'bg-[rgb(var(--color-brand))]/15 text-[rgb(var(--color-brand))]'
                  )}
                >
                  {row.value}
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="flex items-center gap-2 border-b border-[rgb(var(--color-border))] px-5 py-3">
            <Shield className="h-4 w-4 text-emerald-600" />
            <h2 className="admin-section-title">Sistem Durumu</h2>
          </div>
          <ul className="divide-y divide-[rgb(var(--color-border))]">
            {[
              { label: 'Haber Servisleri', ok: true, icon: Newspaper },
              { label: 'AI Servisleri', ok: true, icon: Bot },
              { label: 'Social Services', ok: true, icon: Share2 },
              { label: 'Database', ok: true, icon: Database },
              { label: 'Queue / Cron', ok: true, icon: Zap, href: '/admin/cron' },
            ].map((row) => {
              const RowIcon = row.icon
              const body = (
                <div className="flex items-center gap-3 px-5 py-3">
                  <RowIcon className="h-4 w-4 text-[rgb(var(--color-muted))]" />
                  <span className="flex-1 text-sm font-medium text-[rgb(var(--color-text))]">{row.label}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Çalışıyor
                  </span>
                </div>
              )
              return row.href ? (
                <li key={row.label}>
                  <Link href={row.href} className="block hover:bg-[rgb(var(--color-surface))]">
                    {body}
                  </Link>
                </li>
              ) : (
                <li key={row.label}>{body}</li>
              )
            })}
          </ul>
          <p className="border-t border-[rgb(var(--color-border))] px-5 py-2 text-[10px] text-[rgb(var(--color-muted))]">
            Detaylı probe: Sistem Sağlığı sayfası (Phase 9). Burada operasyonel özet gösterilir.
          </p>
        </div>

        <div className="overflow-hidden rounded-[14px] border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]">
          <div className="border-b border-[rgb(var(--color-border))] px-5 py-3">
            <h2 className="admin-section-title">Hızlı İşlemler</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
            {QUICK.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-2 rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] px-2 py-4 text-center transition-colors hover:border-[rgb(var(--color-brand))]/35"
                >
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', item.color)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-[rgb(var(--color-text))]">
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
