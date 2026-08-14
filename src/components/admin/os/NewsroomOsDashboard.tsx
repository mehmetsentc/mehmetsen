'use client'

import Link from 'next/link'
import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bot,
  Clock,
  HelpCircle,
  ListTodo,
  Map,
  Newspaper,
  Plus,
  Settings,
  Share2,
  Shield,
  Users,
} from 'lucide-react'
import { AdminStatusBadge } from '@/components/admin/AdminStatusBadge'
import { TurkeySmmMap } from '@/components/admin/os/TurkeySmmMap'
import { getCategoryLabel } from '@/lib/newsMapper'
import { cn } from '@/lib/utils'
import { format, formatDistanceToNow } from 'date-fns'
import { tr } from 'date-fns/locale'

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

function Widget({
  title,
  icon: Icon,
  href,
  hrefLabel = 'Tümünü Görüntüle',
  children,
  className,
}: {
  title: string
  icon?: React.ComponentType<{ className?: string }>
  href?: string
  hrefLabel?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('admin-widget flex flex-col', className)}>
      <div className="admin-widget-header">
        <div className="flex min-w-0 items-center gap-2">
          {Icon ? <Icon className="h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" /> : null}
          <h2 className="admin-section-title truncate">{title}</h2>
        </div>
        {href ? (
          <Link
            href={href}
            className="shrink-0 text-[11px] font-semibold text-[rgb(var(--color-brand))] hover:underline"
          >
            {hrefLabel}
          </Link>
        ) : null}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
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
    neutral: 'text-white',
    warning: 'text-amber-400',
    success: 'text-emerald-400',
    ai: 'text-violet-300',
  }
  const iconBg = {
    neutral: 'bg-white/5 text-slate-300',
    warning: 'bg-amber-500/15 text-amber-400',
    success: 'bg-emerald-500/15 text-emerald-400',
    ai: 'bg-violet-500/15 text-violet-300',
  }
  const inner = (
    <div
      className={cn(
        'group relative rounded-[14px] border border-white/10 bg-[rgb(var(--color-card))] p-4 transition-colors',
        href && 'hover:border-[rgb(var(--color-brand))]/40'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
          <p className={cn('admin-kpi-value mt-1.5', tones[tone])}>
            {typeof value === 'number' ? formatCompact(value) : value}
          </p>
          {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
        </div>
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconBg[tone])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {href ? (
        <ArrowUpRight className="absolute right-3 top-3 h-3.5 w-3.5 text-slate-500 opacity-0 transition-opacity group-hover:opacity-100" />
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
    { label: 'Onay Bekleyen', value: pending, color: '#f59e0b' },
    { label: 'Planlanan', value: scheduled, color: '#3b82f6' },
    { label: 'Arşiv', value: archive, color: '#64748b' },
  ]
  const total = parts.reduce((a, p) => a + p.value, 0) || 1
  let acc = 0
  const r = 36
  const c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-5 px-5 py-5">
      <div className="relative h-32 w-32 shrink-0">
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
          <span className="text-xl font-extrabold tabular-nums text-white">
            {formatCompact(parts.reduce((a, p) => a + p.value, 0))}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-slate-400">Toplam</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-2">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="flex items-center gap-2 text-slate-400">
              <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
              {p.label}
            </span>
            <span className="font-semibold tabular-nums text-white">{p.value}</span>
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
  { href: '/admin/settings', label: 'Ayarlar', icon: Settings, color: 'bg-slate-600 text-white' },
] as const

export function NewsroomOsDashboard({
  stats,
  loading,
  liveEvents,
  agentActivity,
  smmActiveSlugs,
  orgSummary,
  healthChecks,
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
  healthChecks?: Array<{ id: string; label: string; status: string; detail: string; href?: string }>
}) {
  const dash = (v: number | string) => (loading ? '–' : v)
  const smmOk = stats.smmActive > 0 && stats.smmActive >= Math.min(stats.smmTotal, 81)

  return (
    <div className="space-y-4 p-4 sm:p-5 lg:p-6">
      {/* Row 1 — KPI strip */}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <KpiCard
          title="Yayındaki Haberler"
          value={dash(stats.totalPublished)}
          icon={Newspaper}
          href="/admin/news?filter=published"
        />
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
          tone={smmOk ? 'success' : 'neutral'}
          hint={stats.smmActive === 0 ? 'Seed bekleniyor' : smmOk ? 'Aktif' : 'Kısmi aktif'}
        />
      </section>

      {/* Row 2 — Live feed | Donut | AI activity */}
      <section className="grid gap-4 xl:grid-cols-12">
        <Widget
          title="Canlı Haber Akışı"
          icon={Activity}
          href="/admin/live-center"
          hrefLabel="Canlı Merkez →"
          className="xl:col-span-5"
        >
          <div className="divide-y divide-white/5">
            {liveEvents.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">Şu an canlı sinyal yok.</p>
            ) : (
              liveEvents.slice(0, 6).map((ev) => (
                <Link
                  key={ev.id}
                  href={ev.href}
                  className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-white/[0.03] sm:px-5"
                >
                  <span className="mt-0.5 w-11 shrink-0 text-[11px] font-semibold tabular-nums text-slate-500">
                    {ev.createdAt ? format(new Date(ev.createdAt), 'HH:mm') : '—'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-1.5">
                      <AdminStatusBadge
                        status={
                          ev.kind === 'breaking'
                            ? 'breaking'
                            : ev.kind === 'pending'
                              ? 'pending_review'
                              : 'published'
                        }
                      />
                      <span className="admin-meta">{getCategoryLabel(ev.categoryId)}</span>
                      {ev.cityLabel ? (
                        <span className="text-[11px] font-medium text-sky-400">{ev.cityLabel}</span>
                      ) : null}
                    </div>
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-white">{ev.title}</p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </Widget>

        <Widget title="Haber Durum Dağılımı" className="xl:col-span-3">
          <StatusDonut
            published={stats.totalPublished}
            draft={stats.draftCount}
            pending={stats.pendingReview}
            scheduled={stats.scheduledCount}
            archive={stats.archiveCount}
          />
        </Widget>

        <Widget
          title="AI Ajan Aktivite Akışı"
          icon={Bot}
          href="/admin/ai-tasks"
          className="xl:col-span-4"
        >
          <div className="divide-y divide-white/5">
            {agentActivity.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-slate-500">
                Henüz ajan aktivitesi yok. Task bus bağlandıkça burada görünür.
              </p>
            ) : (
              agentActivity.slice(0, 7).map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                    <Bot className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white">{a.actor}</p>
                    <p className="text-xs text-slate-400">{a.message}</p>
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-500">
                    {a.at
                      ? formatDistanceToNow(new Date(a.at), { locale: tr, addSuffix: true })
                      : ''}
                  </span>
                </div>
              ))
            )}
          </div>
        </Widget>
      </section>

      {/* Row 3 — Map | Top cities */}
      <section className="grid gap-4 xl:grid-cols-12">
        <Widget
          title="81 İl Sosyal Medya Ağı"
          icon={Map}
          href="/admin/smm"
          hrefLabel="SMM paneli →"
          className="xl:col-span-8"
        >
          <div className="grid gap-4 p-4 lg:grid-cols-[1.5fr_1fr]">
            <TurkeySmmMap activeSlugs={smmActiveSlugs} className="min-h-[200px]" />
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {['IG', 'FB', 'X', 'TT', 'YT'].map((p) => (
                  <span
                    key={p}
                    className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold tracking-wide text-slate-300"
                  >
                    {p}
                  </span>
                ))}
              </div>
              <div className="space-y-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs">
                {[
                  { label: 'Toplam SMM', value: String(stats.smmTotal || 81) },
                  { label: 'Aktif SMM', value: String(stats.smmActive) },
                  { label: 'Bağlı hesap', value: '—' },
                  { label: 'Bugün paylaşım', value: '—' },
                  { label: 'Kuyruk', value: String(stats.smmQueue) },
                  { label: 'Toplam erişim', value: '—' },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">{row.label}</span>
                    <span className="font-bold tabular-nums text-white">{row.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] leading-relaxed text-slate-500">
                Erişim / etkileşim platform API bağlanınca dolar. Sahte metrik üretilmez.
              </p>
            </div>
          </div>
        </Widget>

        <Widget title="En İyi Performans Gösteren İller" href="/admin/analytics" className="xl:col-span-4">
          <div className="px-5 py-8 text-center">
            <HelpCircle className="mx-auto mb-3 h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-400">
              İl bazlı erişim / etkileşim metrikleri hesap API’leri bağlanınca burada listelenir.
            </p>
            <Link
              href="/admin/smm"
              className="mt-4 inline-block text-xs font-semibold text-[rgb(var(--color-brand))] hover:underline"
            >
              81 İl SMM durumuna git →
            </Link>
          </div>
        </Widget>
      </section>

      {/* Row 4 — Org | Tasks | Health | Quick */}
      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <Widget title="AI Organizasyon Şeması" href="/admin/ai-org" hrefLabel="Tam şema →">
          <div className="space-y-3 p-4">
            <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 px-4 py-3 text-center">
              <p className="text-sm font-bold text-violet-200">{orgSummary.eic}</p>
              <p className="text-[10px] uppercase tracking-wide text-violet-400">Genel Yayın Yönetmeni AI</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {orgSummary.desks.map((d) => (
                <div
                  key={d.label}
                  className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-center"
                >
                  <p className="text-xs font-semibold text-white">{d.label}</p>
                  <p className="mt-0.5 text-[11px] tabular-nums text-slate-400">{d.count} ajan</p>
                </div>
              ))}
            </div>
          </div>
        </Widget>

        <Widget title="Görev & Onay Merkezi" icon={ListTodo} href="/admin/ai-tasks">
          <div className="divide-y divide-white/5">
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
                className="flex items-center justify-between px-5 py-3 text-sm hover:bg-white/[0.03]"
              >
                <span className="font-medium text-slate-200">{row.label}</span>
                <span
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums',
                    row.tone === 'amber' && 'bg-amber-500/20 text-amber-300',
                    row.tone === 'violet' && 'bg-violet-500/20 text-violet-300',
                    row.tone === 'sky' && 'bg-sky-500/20 text-sky-300',
                    row.tone === 'emerald' && 'bg-emerald-500/20 text-emerald-300',
                    row.tone === 'brand' && 'bg-[rgb(var(--color-brand))]/20 text-red-300'
                  )}
                >
                  {row.value}
                </span>
              </Link>
            ))}
          </div>
        </Widget>

        <Widget title="Sistem Durumu" icon={Shield} href="/admin/system-health">
          <ul className="divide-y divide-white/5">
            {(healthChecks && healthChecks.length > 0
              ? healthChecks
              : [
                  {
                    id: 'news',
                    label: 'Haber Servisleri',
                    status: 'UNKNOWN',
                    detail: 'Probe bekleniyor',
                    href: '/admin/system-health',
                  },
                  {
                    id: 'ai',
                    label: 'AI Servisleri',
                    status: 'UNKNOWN',
                    detail: 'Probe bekleniyor',
                    href: '/admin/ai-models',
                  },
                  {
                    id: 'social',
                    label: 'Sosyal Medya',
                    status: 'UNKNOWN',
                    detail: 'Probe bekleniyor',
                    href: '/admin/social',
                  },
                  {
                    id: 'db',
                    label: 'Veritabanı',
                    status: 'UNKNOWN',
                    detail: 'Probe bekleniyor',
                    href: '/admin/system-health',
                  },
                  {
                    id: 'cron',
                    label: 'Bildirim / Cron',
                    status: 'UNKNOWN',
                    detail: 'Cron sayfası',
                    href: '/admin/cron',
                  },
                ]
            ).map((row) => {
              const ok = row.status === 'HEALTHY'
              const body = (
                <div className="flex items-center gap-3 px-5 py-3">
                  <span
                    className={cn(
                      'h-2 w-2 rounded-full',
                      ok ? 'bg-emerald-500' : row.status === 'DOWN' ? 'bg-red-500' : 'bg-amber-500'
                    )}
                  />
                  <span className="flex-1 text-sm font-medium text-slate-200">{row.label}</span>
                  <span
                    className={cn(
                      'text-xs font-semibold',
                      ok ? 'text-emerald-400' : row.status === 'DOWN' ? 'text-red-400' : 'text-amber-400'
                    )}
                  >
                    {ok ? 'Çalışıyor' : row.status}
                  </span>
                </div>
              )
              return row.href ? (
                <li key={row.id}>
                  <Link href={row.href} className="block hover:bg-white/[0.03]">
                    {body}
                  </Link>
                </li>
              ) : (
                <li key={row.id}>{body}</li>
              )
            })}
          </ul>
        </Widget>

        <Widget title="Hızlı İşlemler">
          <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-2">
            {QUICK.map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-4 text-center transition-colors hover:border-[rgb(var(--color-brand))]/40 hover:bg-white/[0.05]"
                >
                  <span className={cn('flex h-10 w-10 items-center justify-center rounded-xl', item.color)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="text-[11px] font-semibold leading-tight text-slate-200">{item.label}</span>
                </Link>
              )
            })}
          </div>
        </Widget>
      </section>
    </div>
  )
}
