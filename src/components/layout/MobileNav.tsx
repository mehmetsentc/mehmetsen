'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Bell, MapPin, User, Clapperboard } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { logNavClick } from '@/lib/navDiagnostics'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface MobileNavItem {
  icon: LucideIcon
  label: string
  href: string
  center?: boolean
}

function isNavActive(pathname: string, item: MobileNavItem): boolean {
  if (item.href === ROUTES.FEED) return pathname === ROUTES.FEED
  if (item.href === ROUTES.REELS) return pathname === ROUTES.REELS || pathname.startsWith('/reels')
  if (item.href === ROUTES.LOCAL) return pathname.startsWith('/local')
  if (item.href.startsWith('/profile')) return pathname.startsWith('/profile')
  return pathname.startsWith(item.href)
}

interface MobileNavLinkProps {
  item: MobileNavItem
  active: boolean
  pathname: string
}

const MobileNavLink = memo(function MobileNavLink({ item, active, pathname }: MobileNavLinkProps) {
  const { icon: Icon, label, href, center } = item

  const handleClick = useCallback(() => {
    logNavClick(href, pathname)
  }, [href, pathname])

  if (center) {
    return (
      <Link
        href={href}
        aria-label={label}
        onClick={handleClick}
        className="relative -top-4 flex h-14 w-14 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] shadow-lg shadow-[rgb(var(--color-brand))]/40 transition-transform active:scale-95"
      >
        <Icon className="h-7 w-7 text-white" strokeWidth={1.75} />
      </Link>
    )
  }

  return (
    <Link
      href={href}
      prefetch
      aria-label={label}
      onClick={handleClick}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors',
        active ? 'text-[rgb(var(--color-text))]' : 'text-[rgb(var(--color-muted))]'
      )}
    >
      <Icon
        className="h-[22px] w-[22px]"
        strokeWidth={active ? 2.25 : 1.75}
      />
      <span className={cn('text-[10px] leading-none', active ? 'font-bold' : 'font-medium')}>
        {label}
      </span>
    </Link>
  )
})

function MobileNavInner() {
  const pathname = usePathname()
  const { user } = useAuth()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => { setHydrated(true) }, [])

  const profileHref = hydrated && user ? ROUTES.PROFILE(user.username) : ROUTES.LOGIN

  const items = useMemo<MobileNavItem[]>(
    () => [
      { icon: Home,        label: 'Ana Sayfa', href: ROUTES.FEED },
      { icon: Bell,        label: 'Bildirim',  href: ROUTES.NOTIFICATIONS },
      { icon: Clapperboard,label: 'Teve',      href: ROUTES.REELS, center: true },
      { icon: MapPin,      label: 'Yerel',     href: ROUTES.LOCAL },
      { icon: User,        label: 'Profil',    href: profileHref },
    ],
    [profileHref]
  )

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[105] border-t border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface))] lg:hidden">
      <div
        className="flex items-end pb-[var(--safe-bottom)]"
        style={{ height: 'calc(3.5rem + var(--safe-bottom, 0px))' }}
      >
        {items.map((item) => (
          <MobileNavLink
            key={item.href}
            item={item}
            active={isNavActive(pathname, item)}
            pathname={pathname}
          />
        ))}
      </div>
    </nav>
  )
}

export const MobileNav = memo(MobileNavInner)
