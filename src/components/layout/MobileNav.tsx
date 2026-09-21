'use client'

import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Bell, Home, Plus, User, Zap } from 'lucide-react'
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
import { SubmitNewsModal } from '@/components/profile/SubmitNewsModal'

interface MobileNavItem {
  icon: LucideIcon
  label: string
  href: string
  testId: string
  kind: 'home' | 'akis' | 'notifications' | 'profil'
}

function isItemActive(pathname: string, item: MobileNavItem): boolean {
  if (item.kind === 'home') return resolveNewsSurface(pathname) === 'home'
  if (item.kind === 'akis') {
    return (
      resolveNewsSurface(pathname) === 'akis' ||
      pathname === ROUTES.DISCOVER ||
      pathname.startsWith('/discover') ||
      pathname.startsWith('/kesfet')
    )
  }
  if (item.kind === 'notifications') {
    return pathname === ROUTES.NOTIFICATIONS || pathname.startsWith('/bildirimler')
  }
  return (
    pathname.startsWith('/profil/') ||
    pathname.startsWith('/profile/') ||
    pathname.startsWith('/u/')
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
      className={cn('nah-nav-slot touch-manipulation', active && 'is-active')}
    >
      <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.45 : 1.85} />
      <span className="nah-nav-slot__label">{label}</span>
    </Link>
  )
})

function MobileNavInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading } = useAuth()
  const [hydrated, setHydrated] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const categoryId = resolveSharedCategoryId(pathname, searchParams.toString())
  const profileHref =
    hydrated && !loading && user
      ? ROUTES.PROFILE(user.username || user.uid)
      : ROUTES.LOGIN

  const leftItems = useMemo<MobileNavItem[]>(
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
        label: 'Keşfet',
        href: hrefForNewsSurface('akis', categoryId),
        testId: 'header-nav-akis',
        kind: 'akis',
      },
    ],
    [categoryId]
  )

  const rightItems = useMemo<MobileNavItem[]>(
    () => [
      {
        icon: Bell,
        label: 'Bildirimler',
        href: ROUTES.NOTIFICATIONS,
        testId: 'header-nav-bildirimler',
        kind: 'notifications',
      },
      {
        icon: User,
        label: 'Profil',
        href: profileHref,
        testId: 'header-nav-profil',
        kind: 'profil',
      },
    ],
    [profileHref]
  )

  return (
    <>
      <nav
        className="mobile-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[105] flex justify-center px-[var(--mobile-nav-inset-x)] pb-[calc(var(--safe-bottom,0px)+var(--mobile-nav-float-gap))] lg:hidden"
        aria-label="Ana menü"
        data-testid="mobile-bottom-nav"
      >
        <div className="mobile-bottom-nav-pill pointer-events-auto">
          {leftItems.map((item) => (
            <MobileNavLink
              key={item.kind}
              item={item}
              active={isItemActive(pathname, item)}
              pathname={pathname}
            />
          ))}

          <button
            type="button"
            aria-label="Haber Ekle"
            data-testid="header-nav-haber-ekle"
            onClick={() => setSubmitOpen(true)}
            className="nah-nav-plus touch-manipulation"
          >
            <Plus className="h-6 w-6" strokeWidth={2.4} />
          </button>

          {rightItems.map((item) => (
            <MobileNavLink
              key={item.kind}
              item={item}
              active={isItemActive(pathname, item)}
              pathname={pathname}
            />
          ))}
        </div>
      </nav>
      {submitOpen ? <SubmitNewsModal onClose={() => setSubmitOpen(false)} /> : null}
    </>
  )
}

export const MobileNav = memo(MobileNavInner)
