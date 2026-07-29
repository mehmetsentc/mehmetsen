'use client'

import Link from 'next/link'
import { Bell, Search } from 'lucide-react'
import { useCmsAuth } from '@/hooks/useCmsAuth'
import { useMobileAdmin } from './MobileAdminContext'
import { cn } from '@/lib/utils'

export function MobileAdminHeader() {
  const { user, roleLabel } = useCmsAuth()
  const { hideChrome, pendingBadge, openSearch, openNotif } = useMobileAdmin()

  if (hideChrome) return null

  const initial =
    user?.displayName?.[0]?.toUpperCase() ?? user?.email?.[0]?.toUpperCase() ?? 'N'

  return (
    <header
      className="sticky top-0 z-30 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/95 backdrop-blur-md md:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
    >
      <div className="flex h-14 items-center gap-1 px-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold leading-tight tracking-tight text-[rgb(var(--color-text))]">
            <span className="text-[rgb(var(--color-brand))]">Na</span>Haber Newsroom
          </p>
          <p className="truncate text-[11px] text-[rgb(var(--color-muted))]">{roleLabel}</p>
        </div>

        <button
          type="button"
          onClick={openSearch}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]"
          aria-label="Ara"
        >
          <Search className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={openNotif}
          className="relative flex h-11 w-11 items-center justify-center rounded-xl text-[rgb(var(--color-muted))]"
          aria-label="Bildirimler"
        >
          <Bell className="h-5 w-5" />
          {pendingBadge > 0 ? (
            <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] px-1 text-[9px] font-bold text-white">
              {pendingBadge > 99 ? '99+' : pendingBadge}
            </span>
          ) : null}
        </button>

        <Link
          href="/admin/menu"
          className={cn(
            'ml-0.5 flex h-9 w-9 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-xs font-bold text-white'
          )}
          title={roleLabel}
          aria-label="Profil ve menü"
        >
          {initial}
        </Link>
      </div>
    </header>
  )
}
