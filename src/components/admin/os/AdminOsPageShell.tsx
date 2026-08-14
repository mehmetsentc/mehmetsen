'use client'

import Link from 'next/link'
import type { LucideIcon } from 'lucide-react'
import { AlertTriangle, Inbox } from 'lucide-react'
import { CMSHeader } from '@/components/admin/CMSHeader'
import { cn } from '@/lib/utils'

export function AdminOsPageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="min-h-full">
      <CMSHeader title={title} subtitle={subtitle} actions={actions} />
      <div className="space-y-4 p-4 md:p-6">{children}</div>
    </div>
  )
}

export function AdminOsEmptyState({
  title,
  description,
  icon: Icon = Inbox,
  href,
  hrefLabel,
}: {
  title: string
  description: string
  icon?: LucideIcon
  href?: string
  hrefLabel?: string
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-white/10 bg-[rgb(var(--admin-card))] px-6 py-16 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-slate-400">
        <Icon className="h-6 w-6" />
      </div>
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {href && hrefLabel ? (
        <Link
          href={href}
          className="mt-5 rounded-lg bg-[rgb(var(--color-brand))] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          {hrefLabel}
        </Link>
      ) : null}
    </div>
  )
}

export function AdminOsErrorState({
  title = 'Modül yüklenemedi',
  description,
  onRetry,
}: {
  title?: string
  description: string
  onRetry?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-red-500/30 bg-red-500/5 px-6 py-12 text-center">
      <AlertTriangle className="mb-3 h-7 w-7 text-red-400" />
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 rounded-lg border border-white/15 px-4 py-2 text-sm text-white hover:bg-white/5"
        >
          Yeniden dene
        </button>
      ) : null}
    </div>
  )
}

export function AdminOsMetricGrid({
  items,
}: {
  items: Array<{ label: string; value: string; hint?: string; tone?: 'default' | 'ok' | 'warn' | 'ai' }>
}) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-white/10 bg-[rgb(var(--admin-card))] px-4 py-3"
        >
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{item.label}</p>
          <p
            className={cn(
              'mt-1 text-xl font-bold tabular-nums text-white',
              item.tone === 'ok' && 'text-emerald-400',
              item.tone === 'warn' && 'text-amber-400',
              item.tone === 'ai' && 'text-violet-300'
            )}
          >
            {item.value}
          </p>
          {item.hint ? <p className="mt-1 text-[11px] text-slate-500">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  )
}
