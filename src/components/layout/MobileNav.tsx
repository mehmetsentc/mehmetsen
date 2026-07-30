'use client'

import { memo, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, Tv, Bookmark, MapPin, Trophy } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { logNavClick } from '@/lib/navDiagnostics'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface MobileNavItem {
  icon: LucideIcon
  label: string
  href: string
}

function isNavActive(pathname: string, item: MobileNavItem): boolean {
  if (item.href === ROUTES.FEED) return pathname === ROUTES.FEED || pathname === '/'
  if (item.href === ROUTES.SEARCH) {
    return pathname.startsWith(ROUTES.SEARCH) || pathname.startsWith(ROUTES.SEARCH_TR)
  }
  if (item.href === ROUTES.REELS) return pathname.startsWith(ROUTES.REELS)
  if (item.href === ROUTES.SAVED) return pathname.startsWith(ROUTES.SAVED)
  if (item.href === ROUTES.SKOR) {
    return pathname === ROUTES.SKOR || pathname.startsWith(`${ROUTES.SKOR}/`)
  }
  if (item.href === ROUTES.LOCAL) {
    return pathname === ROUTES.LOCAL || pathname.startsWith(`${ROUTES.LOCAL}/`)
  }
  return pathname.startsWith(item.href)
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
        'flex flex-1 flex-col items-center justify-center gap-1 py-2 transition-colors',
        active ? 'text-[rgb(var(--color-nav-active))]' : 'text-[rgb(var(--color-nav-inactive))]'
      )}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
      <span className={cn('text-[10px] leading-none', active ? 'font-bold' : 'font-semibold')}>
        {label}
      </span>
    </Link>
  )
})

function MobileNavInner() {
  const pathname = usePathname()

  const items = useMemo<MobileNavItem[]>(
    () => [
      { icon: Home, label: 'Ana Sayfa', href: ROUTES.FEED },
      { icon: Search, label: 'Ara', href: ROUTES.SEARCH },
      { icon: Trophy, label: 'Skor', href: ROUTES.SKOR },
      { icon: Tv, label: 'Reels', href: ROUTES.REELS },
      { icon: Bookmark, label: 'Kayıtlı', href: ROUTES.SAVED },
      { icon: MapPin, label: 'Yerel', href: ROUTES.LOCAL },
    ],
    []
  )

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-[105] border-t border-[rgb(var(--color-nav-bar-border))] bg-[rgb(var(--color-nav-bar))]/95 backdrop-blur-xl lg:hidden"
      aria-label="Ana menü"
    >
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
