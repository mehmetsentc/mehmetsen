'use client'

import { cn } from '@/lib/utils'

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  published: {
    label: 'Yayında',
    cls: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  },
  pending: {
    label: 'Bekliyor',
    cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  pending_review: {
    label: 'Onay Bekliyor',
    cls: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  },
  review: {
    label: 'İnceleme',
    cls: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  published_pending_review: {
    label: 'İnceleme',
    cls: 'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  },
  rejected: {
    label: 'Reddedildi',
    cls: 'bg-red-500/10 text-red-700 dark:text-red-300',
  },
  draft: {
    label: 'Taslak',
    cls: 'bg-[rgb(var(--color-border))]/60 text-[rgb(var(--color-muted))]',
  },
  archived: {
    label: 'Arşiv',
    cls: 'bg-[rgb(var(--color-border))]/60 text-[rgb(var(--color-muted))]',
  },
  banned: {
    label: 'Yasaklı',
    cls: 'bg-red-500/10 text-red-700 dark:text-red-300',
  },
  breaking: {
    label: 'Son Dakika',
    cls: 'bg-red-500/15 text-red-700 dark:text-red-300',
  },
  trend: {
    label: 'Trend',
    cls: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',
  },
  new: {
    label: 'Yeni',
    cls: 'bg-[rgb(var(--color-brand))]/10 text-[rgb(var(--color-brand))]',
  },
}

interface AdminStatusBadgeProps {
  status: string
  className?: string
}

export function AdminStatusBadge({ status, className }: AdminStatusBadgeProps) {
  const s = STATUS_MAP[status] ?? {
    label: status,
    cls: 'bg-[rgb(var(--color-border))]/60 text-[rgb(var(--color-muted))]',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        s.cls,
        className
      )}
    >
      {s.label}
    </span>
  )
}
