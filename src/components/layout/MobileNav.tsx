'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, PlusSquare, Clapperboard, User, MessageCircle, CalendarDays } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { NavMessagesBadge } from '@/components/layout/NavMessagesBadge'
import { logNavClick } from '@/lib/navDiagnostics'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface MobileNavItem {
  icon: LucideIcon
  label: string
  href: string
  accent?: boolean
  showBadge?: boolean
}

function isNavActive(pathname: string, href: string): boolean {
  if (href === ROUTES.MESSAGES) return pathname.startsWith('/messages')
  if (href.startsWith('/profile')) return pathname.startsWith('/profile')
  return pathname === href
}

interface MobileNavLinkProps {
  item: MobileNavItem
  active: boolean
  pathname: string
}

const MobileNavLink = memo(function MobileNavLink({ item, active, pathname }: MobileNavLinkProps) {
  const { icon: Icon, label, href, accent, showBadge } = item

  const handleClick = useCallback(() => {
    logNavClick(href, pathname)
  }, [href, pathname])

  return (
    <Link
      href={href}
      prefetch
      aria-label={label}
      onClick={handleClick}
      className={cn(
        'nav-tap-target relative flex flex-col items-center gap-0.5 rounded-xl p-1.5 transition-colors',
        accent && 'relative -mt-3',
        active ? 'text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]'
      )}
    >
      <span
        className={cn(
          'relative flex items-center justify-center rounded-xl',
          accent && 'h-11 w-11 bg-brand-600 text-white shadow-lg shadow-brand-600/30'
        )}
      >
        <Icon className={cn('h-5 w-5', accent && 'stroke-[2.5]')} />
        {showBadge && !accent && <NavMessagesBadge size="sm" />}
      </span>
      {!accent && <span className="text-[9px] font-medium">{label.split(' ')[0]}</span>}
    </Link>
  )
})

function MobileNavInner() {
  const pathname = usePathname()
  const { user } = useAuth()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const profileHref = hydrated && user ? ROUTES.PROFILE(user.username) : ROUTES.LOGIN

  const items = useMemo<MobileNavItem[]>(
    () => [
      { icon: Home, label: 'Ana Sayfa', href: ROUTES.FEED },
      { icon: CalendarDays, label: 'Etkinlik', href: ROUTES.EVENTS },
      { icon: Search, label: 'Keşfet', href: ROUTES.DISCOVER },
      { icon: PlusSquare, label: 'Oluştur', href: ROUTES.POST_CREATE, accent: true },
      { icon: MessageCircle, label: 'Mesajlar', href: ROUTES.MESSAGES, showBadge: true },
      { icon: Clapperboard, label: 'Teve', href: ROUTES.REELS },
      { icon: User, label: 'Profil', href: profileHref },
    ],
    [profileHref]
  )

  return (
    <nav className="app-nav-mobile fixed bottom-0 left-0 right-0 z-[105] border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/95 backdrop-blur-md lg:hidden">
      <div className="flex h-16 items-center justify-around px-2 pb-[var(--safe-bottom)]">
        {items.map((item) => (
          <MobileNavLink
            key={item.href}
            item={item}
            active={isNavActive(pathname, item.href)}
            pathname={pathname}
          />
        ))}
      </div>
    </nav>
  )
}

export const MobileNav = memo(MobileNavInner)
