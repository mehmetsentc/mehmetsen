'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Menu } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { BrandLogo } from '@/components/brand/BrandLogo'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { ROUTES } from '@/constants/routes'

interface NavbarProps {
  onMenuClick?: () => void
}

export function Navbar({ onMenuClick }: NavbarProps = {}) {
  const { user } = useAuth()
  const { unreadCount } = useNotifications()
  const pathname = usePathname()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  return (
    <header className="sticky top-0 z-40 border-b border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))]/90 backdrop-blur-sm lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMenuClick}
            className="rounded-full p-2 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
            aria-label="Menü"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href={ROUTES.FEED} aria-label="NaHaber">
            <BrandLogo size="md" />
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Link
            href={ROUTES.NOTIFICATIONS}
            className="relative rounded-full p-2 text-[rgb(var(--color-muted))] hover:bg-[rgb(var(--color-surface))]"
            aria-label="Bildirimler"
          >
            <Bell className="h-5 w-5" />
            {hydrated && unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-none text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
          {hydrated && user && (
            <Link href={ROUTES.PROFILE(user.username)}>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600/15 text-sm font-semibold text-brand-600">
                {user.displayName[0].toUpperCase()}
              </div>
            </Link>
          )}
        </div>
      </div>
    </header>
  )
}
