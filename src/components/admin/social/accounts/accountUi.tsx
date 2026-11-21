'use client'

/** Small presentational pieces shared by the accounts list and the detail panel. */
import { AlertTriangle, CheckCircle2, Clock, PauseCircle, PlugZap, RefreshCw, ShieldQuestion } from 'lucide-react'
import { TURKISH_PROVINCES } from '@/constants/cities'
import { cn } from '@/lib/utils'
import { STATE_LABEL, initials, type AccountState, type ListPlatform } from '@/lib/social/accounts/accountListView'
import type { SocialAccountRow } from '@/components/social/socialClient'

export const PLATFORM_NAME: Record<ListPlatform, string> = { instagram: 'Instagram', facebook: 'Facebook', threads: 'Threads', youtube: 'YouTube', tiktok: 'TikTok' }

const PROVINCE_NAME = new Map(TURKISH_PROVINCES.map((p) => [p.slug, p.name]))
export const provinceName = (slug: string | null | undefined) => (slug ? (PROVINCE_NAME.get(slug) ?? slug) : '')

export const fmtDate = (ms: number) =>
  new Date(ms).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Neutral platform mark (letter + platform colour) + the platform name as text — never colour alone. */
const PLATFORM_MARK: Record<ListPlatform, { letter: string; cls: string }> = {
  instagram: { letter: 'IG', cls: 'bg-gradient-to-br from-amber-400 via-pink-500 to-purple-600 text-white' },
  facebook: { letter: 'f', cls: 'bg-[#1877F2] text-white' },
  threads: { letter: '@', cls: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' },
  youtube: { letter: '▶', cls: 'bg-[#FF0000] text-white' },
  tiktok: { letter: '♪', cls: 'bg-neutral-900 text-white dark:bg-white dark:text-neutral-900' },
}

export function PlatformMark({ platform, className }: { platform: ListPlatform; className?: string }) {
  const m = PLATFORM_MARK[platform]
  return (
    <span aria-hidden className={cn('inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[9px] font-black leading-none', m.cls, className)}>
      {m.letter}
    </span>
  )
}

export function PlatformLabel({ platform, compact = false }: { platform: ListPlatform; compact?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <PlatformMark platform={platform} />
      <span className={cn('truncate', compact && 'text-xs')}>{PLATFORM_NAME[platform]}</span>
    </span>
  )
}

/** Avatar fallback: brand initials (the API exposes no profile picture). */
export function AccountAvatar({ name, size = 'md' }: { name: string; size?: 'md' | 'lg' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] font-bold text-white',
        size === 'lg' ? 'h-14 w-14 text-lg' : 'h-9 w-9 text-xs',
      )}
    >
      {initials(name)}
    </span>
  )
}

const STATE_STYLE: Record<AccountState, { tone: string; Icon: typeof CheckCircle2 }> = {
  ready: { tone: 'bg-emerald-50 text-emerald-800 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900', Icon: CheckCircle2 },
  expiring: { tone: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900', Icon: Clock },
  reconnect: { tone: 'bg-red-50 text-red-800 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900', Icon: RefreshCw },
  unverified: { tone: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900', Icon: ShieldQuestion },
  limited: { tone: 'bg-amber-50 text-amber-900 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-100 dark:ring-amber-900', Icon: AlertTriangle },
  paused: { tone: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700', Icon: PauseCircle },
  disconnected: { tone: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700', Icon: PlugZap },
}

/** Status chip: icon + text (status is never conveyed by colour alone). */
export function StatePill({ state, title }: { state: AccountState; title?: string }) {
  const s = STATE_STYLE[state]
  return (
    <span title={title} className={cn('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset', s.tone)}>
      <s.Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {STATE_LABEL[state]}
    </span>
  )
}

export function AutomationPill({ count }: { count: number }) {
  return count > 0 ? (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" /> Açık · {count} kural
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-[rgb(var(--color-surface))] px-2 py-0.5 text-xs font-semibold text-[rgb(var(--color-muted))] ring-1 ring-inset ring-[rgb(var(--color-border))]">
      <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-current" /> Kapalı
    </span>
  )
}

/** «Hesabı yöneten» — ownership, independent of content scope. */
export function ownershipText(a: SocialAccountRow, publisherNames: Record<string, string>): string {
  switch (a.ownerKind) {
    case 'central':
      return 'Merkez ekip'
    case 'province':
      return `İl ekibi · ${provinceName(a.ownership.citySlug)}`
    case 'publisher':
      return `Yayıncı · ${publisherNames[a.ownership.publisherId ?? ''] ?? a.ownership.publisherId ?? ''}`
    default:
      return 'Kişisel'
  }
}

/** Token lifetime + the REAL renewal state (only Instagram Login / Threads are auto-renewed). */
export function expiryText(a: SocialAccountRow): string {
  if (a.connectionMethod === 'legacy') return 'Eski (legacy) bağlantı — süre bilgisi yok'
  const renewable = a.connectionMethod === 'instagram_login' || a.connectionMethod === 'threads_oauth'
  const refreshed = a.tokenRefreshedAt ? ` Son otomatik yenileme: ${fmtDate(a.tokenRefreshedAt)}.` : renewable ? ' Henüz otomatik yenilenmedi.' : ''
  if (a.tokenExpiresAt === null) return a.tokenExpiryVerified ? 'Süresiz erişim (Sayfa erişimi).' : 'Platform erişim süresini bildirmedi.'
  const ms = a.tokenExpiresAt - Date.now()
  if (ms <= 0) return 'Erişim süresi dolmuş — yeniden bağlayın.'
  const days = Math.floor(ms / 86_400_000)
  const left = days >= 1 ? `${days} gün daha geçerli (${fmtDate(a.tokenExpiresAt)}).` : 'Erişimin bitmesine bir günden az kaldı.'
  return renewable ? `${left} Bitişe 15 gün kala otomatik yenileme denenir; başarısız olursa yeniden bağlantı istenir.${refreshed}` : `${left} Süre dolunca yeniden bağlantı gerekir.`
}
