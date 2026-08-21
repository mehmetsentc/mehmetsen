'use client'

import { memo, useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Search, Plus, Trophy, MapPin } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { logNavClick } from '@/lib/navDiagnostics'
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
        'flex flex-1 flex-col items-center justify-center gap-1 py-2 touch-manipulation transition-colors',
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
  const [submitOpen, setSubmitOpen] = useState(false)

  const leftItems = useMemo<MobileNavItem[]>(
    () => [
      { icon: Home,   label: 'Ana Sayfa', href: ROUTES.FEED },
      { icon: Search, label: 'Ara',       href: ROUTES.SEARCH },
    ],
    []
  )

  const rightItems = useMemo<MobileNavItem[]>(
    () => [
      { icon: Trophy, label: 'Spor',  href: ROUTES.SPOR },
      { icon: MapPin, label: 'Yerel', href: ROUTES.LOCAL },
    ],
    []
  )

  return (
    <>
      <nav
        className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-[105] border-t border-[rgb(var(--color-nav-bar-border))] bg-[rgb(var(--color-nav-bar))] lg:hidden"
        aria-label="Ana menü"
      >
        <div
          className="flex items-end pb-[var(--safe-bottom)]"
          style={{ height: 'calc(3.5rem + var(--safe-bottom, 0px))' }}
        >
          {/* Sol: Ana Sayfa + Ara */}
          {leftItems.map((item) => (
            <MobileNavLink
              key={item.href}
              item={item}
              active={isNavActive(pathname, item.href)}
              pathname={pathname}
            />
          ))}

          {/* Ortada: Haber Ekle FAB */}
          <div className="flex flex-1 flex-col items-center justify-center">
            <button
              type="button"
              aria-label="Haber Ekle"
              onClick={() => setSubmitOpen(true)}
              className="flex h-12 w-12 -translate-y-2 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-white shadow-lg touch-manipulation transition-transform active:scale-95"
            >
              <Plus className="h-6 w-6" strokeWidth={2.5} />
            </button>
          </div>

          {/* Sağ: Spor + Yerel */}
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
