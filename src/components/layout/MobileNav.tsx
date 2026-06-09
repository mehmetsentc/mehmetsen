'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Home, Compass, MapPin, Clapperboard, Bell, User } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { logNavClick } from '@/lib/navDiagnostics'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface MobileNavItem {
  icon: LucideIcon
  label: string
  href: string
  matchFn?: (pathname: string, search: string) => boolean
}

const LOCAL_HREF = `${ROUTES.FEED}?category=yerel-haber`

function isNavActive(pathname: string, search: string, item: MobileNavItem): boolean {
  if (item.matchFn) return item.matchFn(pathname, search)
  if (item.href === ROUTES.FEED) return pathname === ROUTES.FEED && !search.includes('category=yerel-haber')
  if (item.href === LOCAL_HREF) return pathname === ROUTES.FEED && search.includes('category=yerel-haber')
  if (item.href.startsWith('/profile')) return pathname.startsWith('/profile')
  if (item.href === ROUTES.NOTIFICATIONS) return pathname.startsWith('/notifications')
  if (item.href === ROUTES.DISCOVER) return pathname.startsWith('/discover')
  if (item.href === ROUTES.REELS) return pathname === ROUTES.REELS || pathname.startsWith('/reels')
  return pathname === item.href
}

interface MobileNavLinkProps {
  item: MobileNavItem
  active: boolean
  pathname: string
}

const MobileNavLink = memo(function MobileNavLink({ item, active, pathname }: MobileNavLinkProps) {
  const { icon: Icon, label, href } = item

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
        'flex flex-1 flex-col items-center justify-center gap-0.5 py-2 transition-colors',
        active
          ? 'text-[rgb(var(--color-brand))]'
          : 'text-[rgb(var(--color-muted))]'
      )}
    >
      <span className="relative flex items-center justify-center">
        <Icon
          className={cn(
            'h-5 w-5 transition-transform',
            active && 'scale-110'
          )}
          strokeWidth={active ? 2.5 : 1.75}
        />
        {/* Active dot */}
        {active && (
          <span className="absolute -bottom-1.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-[rgb(var(--color-brand))]" />
        )}
      </span>
      <span className={cn('text-[9px] font-medium leading-none', active && 'font-bold')}>
        {label}
      </span>
    </Link>
  )
})

function MobileNavInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const search = searchParams.toString()
  const { user } = useAuth()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => { setHydrated(true) }, [])

  const profileHref = hydrated && user ? ROUTES.PROFILE(user.username) : ROUTES.LOGIN

  const items = useMemo<MobileNavItem[]>(
    () => [
      { icon: Home, label: 'Ana Sayfa', href: ROUTES.FEED },
      { icon: Compass, label: 'Keşfet', href: ROUTES.DISCOVER },
      { icon: MapPin, label: 'Yerel', href: LOCAL_HREF },
      { icon: Clapperboard, label: 'Teve', href: ROUTES.REELS },
      { icon: Bell, label: 'Bildirim', href: ROUTES.NOTIFICATIONS },
      { icon: User, label: 'Profil', href: profileHref },
    ],
    [profileHref]
  )

  return (
    <nav className="app-nav-mobile fixed bottom-0 left-0 right-0 z-[105] border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))]/95 backdrop-blur-md lg:hidden">
      <div className="flex h-14 items-stretch pb-[var(--safe-bottom)]">
        {items.map((item) => (
          <MobileNavLink
            key={item.href}
            item={item}
            active={isNavActive(pathname, search, item)}
            pathname={pathname}
          />
        ))}
      </div>
    </nav>
  )
}

export const MobileNav = memo(MobileNavInner)
