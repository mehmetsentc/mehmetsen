'use client'

import { memo, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MapPin, CalendarDays, Trophy } from 'lucide-react'
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
  if (item.href === ROUTES.FEED) return pathname === ROUTES.FEED
  if (item.href === ROUTES.LOCAL) return pathname.startsWith(ROUTES.LOCAL)
  if (item.href === ROUTES.EVENTS) return pathname.startsWith('/events')
  if (item.href === ROUTES.SPOR) return pathname.startsWith('/kategori/spor')
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

  const items = useMemo<MobileNavItem[]>(
    () => [
      { icon: Home,        label: 'Ana Sayfa', href: ROUTES.FEED },
      { icon: Trophy,      label: 'Spor',      href: ROUTES.SPOR },
      { icon: CalendarDays,label: 'Etkinlik',  href: ROUTES.EVENTS },
      { icon: MapPin,      label: 'Yerel',     href: ROUTES.LOCAL },
    ],
    []
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
