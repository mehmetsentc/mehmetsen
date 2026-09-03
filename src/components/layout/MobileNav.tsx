'use client'

import { memo, useCallback, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, Plus, Zap, MapPin } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { logNavClick } from '@/lib/navDiagnostics'
import { clearFeedRestore } from '@/lib/feed/feedRestoration'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'
import { SubmitNewsModal } from '@/components/profile/SubmitNewsModal'

interface MobileNavItem {
  icon: LucideIcon
  label: string
  href: string
}

function isNavActive(pathname: string, href: string): boolean {
  if (href === ROUTES.FEED) return pathname === ROUTES.FEED || pathname === '/'
  if (href === ROUTES.FEED_V2) {
    return pathname === ROUTES.FEED_V2 || pathname.startsWith(`${ROUTES.FEED_V2}/`)
  }
  if (href === ROUTES.SEARCH) {
    return pathname.startsWith(ROUTES.SEARCH) || pathname.startsWith(ROUTES.SEARCH_TR)
  }
  if (href === ROUTES.SPOR) {
    return pathname === ROUTES.SPOR || pathname.startsWith(`${ROUTES.SPOR}/`)
  }
  if (href === ROUTES.LOCAL) {
    return pathname === ROUTES.LOCAL || pathname.startsWith(`${ROUTES.LOCAL}/`)
  }
  return pathname.startsWith(href)
}

function NavSlotChrome({
  active,
  badge,
  children,
}: {
  active: boolean
  badge?: ReactNode
  children: ReactNode
}) {
  return (
    <span
      className={cn(
        'relative flex h-11 w-11 items-center justify-center rounded-[14px] transition-colors duration-150',
        active ? 'bg-white/20 text-white' : 'text-white/90'
      )}
    >
      {children}
      {badge}
    </span>
  )
}

interface MobileNavLinkProps {
  item: MobileNavItem
  active: boolean
  pathname: string
  badge?: ReactNode
}

const MobileNavLink = memo(function MobileNavLink({
  item,
  active,
  pathname,
  badge,
}: MobileNavLinkProps) {
  const { icon: Icon, label, href } = item

  const handleClick = useCallback(() => {
    // Fresh main-nav entry must not restore article→back session (CASE B).
    if (href === ROUTES.FEED_V2) clearFeedRestore()
    logNavClick(href, pathname)
  }, [href, pathname])

  return (
    <Link
      href={href}
      prefetch
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      onClick={handleClick}
      className="flex flex-1 items-center justify-center touch-manipulation"
    >
      <NavSlotChrome active={active} badge={badge}>
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.35 : 1.85} />
      </NavSlotChrome>
    </Link>
  )
})

function MobileNavInner() {
  const pathname = usePathname()
  const [submitOpen, setSubmitOpen] = useState(false)

  const leftItems = useMemo<MobileNavItem[]>(
    () => [
      { icon: Home, label: 'Ana Sayfa', href: ROUTES.FEED },
      { icon: Search, label: 'Ara', href: ROUTES.SEARCH },
    ],
    []
  )

  const rightItems = useMemo<MobileNavItem[]>(
    () => [
      { icon: Zap, label: 'Akış', href: ROUTES.FEED_V2 },
      { icon: MapPin, label: 'Yerel', href: ROUTES.LOCAL },
    ],
    []
  )

  return (
    <>
      <nav
        className="mobile-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[105] flex justify-center px-[var(--mobile-nav-inset-x)] pb-[calc(var(--safe-bottom,0px)+var(--mobile-nav-float-gap))] lg:hidden"
        aria-label="Ana menü"
      >
        <div className="mobile-bottom-nav-pill pointer-events-auto">
          {leftItems.map((item) => (
            <MobileNavLink
              key={item.href}
              item={item}
              active={isNavActive(pathname, item.href)}
              pathname={pathname}
            />
          ))}

          <button
            type="button"
            aria-label="Haber Ekle"
            onClick={() => setSubmitOpen(true)}
            className="flex flex-1 items-center justify-center touch-manipulation"
          >
            <NavSlotChrome active={false}>
              <Plus className="h-[22px] w-[22px]" strokeWidth={2.25} />
            </NavSlotChrome>
          </button>

          {rightItems.map((item) => (
            <MobileNavLink
              key={item.href}
              item={item}
              active={isNavActive(pathname, item.href)}
              pathname={pathname}
            />
          ))}
        </div>
      </nav>

      {submitOpen && <SubmitNewsModal onClose={() => setSubmitOpen(false)} />}
    </>
  )
}

export const MobileNav = memo(MobileNavInner)
