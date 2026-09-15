'use client'

import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Home, User, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { logNavClick } from '@/lib/navDiagnostics'
import { clearFeedRestoreForFeedV2Nav } from '@/lib/feed/feedRestoration'
import { rememberFeedV2EntryOrigin } from '@/lib/feed/reader/feedV2Exit'
import {
  hrefForNewsSurface,
  resolveNewsSurface,
  resolveSharedCategoryId,
} from '@/lib/feed/sharedCategoryRail'
import { ROUTES } from '@/constants/routes'
import { cn } from '@/lib/utils'

interface MobileNavItem {
  icon: LucideIcon
  label: string
  href: string
  testId: string
  kind: 'home' | 'akis' | 'profil'
}

function isProfilPath(pathname: string): boolean {
  return (
    pathname.startsWith('/profile/') ||
    pathname.startsWith('/u/') ||
    pathname === ROUTES.LOGIN ||
    pathname.startsWith(`${ROUTES.LOGIN}/`)
  )
}

function isItemActive(pathname: string, item: MobileNavItem): boolean {
  if (item.kind === 'home') return resolveNewsSurface(pathname) === 'home'
  if (item.kind === 'akis') return resolveNewsSurface(pathname) === 'akis'
  return isProfilPath(pathname)
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
        'relative flex h-12 w-12 items-center justify-center rounded-[14px] transition-colors duration-150',
        /* Legacy MobileNav (Global Nav V2 kill-switch only): P19 red / transparent. */
        active
          ? 'bg-transparent text-[rgb(var(--brand-500))]'
          : 'bg-transparent text-white/45'
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
}

const MobileNavLink = memo(function MobileNavLink({
  item,
  active,
  pathname,
}: MobileNavLinkProps) {
  const { icon: Icon, label, href, testId } = item

  const handleClick = useCallback(() => {
    if (item.kind === 'akis') {
      rememberFeedV2EntryOrigin(pathname)
      clearFeedRestoreForFeedV2Nav({ pathname })
    }
    logNavClick(href, pathname)
  }, [href, item.kind, pathname])

  return (
    <Link
      href={href}
      prefetch
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      data-testid={testId}
      onClick={handleClick}
      className="flex items-center justify-center touch-manipulation"
    >
      <NavSlotChrome active={active}>
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.45 : 2} />
      </NavSlotChrome>
    </Link>
  )
})

function MobileNavInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const categoryId = resolveSharedCategoryId(pathname, searchParams.toString())
  const profileHref =
    hydrated && !loading && user
      ? ROUTES.PROFILE(user.username || user.uid)
      : ROUTES.LOGIN

  const items = useMemo<MobileNavItem[]>(
    () => [
      {
        icon: Home,
        label: 'Ana Sayfa',
        href: hrefForNewsSurface('home', categoryId),
        testId: 'header-nav-ana-sayfa',
        kind: 'home',
      },
      {
        icon: Zap,
        label: 'Akış',
        href: hrefForNewsSurface('akis', categoryId),
        testId: 'header-nav-akis',
        kind: 'akis',
      },
      {
        icon: User,
        label: 'Profil',
        href: profileHref,
        testId: 'header-nav-profil',
        kind: 'profil',
      },
    ],
    [categoryId, profileHref]
  )

  return (
    <nav
      className="mobile-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[105] flex justify-center px-[var(--mobile-nav-inset-x)] pb-[calc(var(--safe-bottom,0px)+var(--mobile-nav-float-gap))] lg:hidden"
      aria-label="Ana menü"
      data-testid="mobile-bottom-nav"
    >
      <div className="mobile-bottom-nav-pill pointer-events-auto">
        {items.map((item) => (
          <MobileNavLink
            key={item.kind}
            item={item}
            active={isItemActive(pathname, item)}
            pathname={pathname}
          />
        ))}
      </div>
    </nav>
  )
}

export const MobileNav = memo(MobileNavInner)
