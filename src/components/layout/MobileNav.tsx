'use client'

import { memo, useCallback, useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Home, Plus, Search, User, Zap } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { Avatar } from '@/components/ui/Avatar'
import { SubmitNewsModal } from '@/components/profile/SubmitNewsModal'
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

type NavKind = 'home' | 'akis' | 'search' | 'profil'

interface MobileNavItem {
  icon: LucideIcon
  label: string
  href: string
  testId: string
  kind: NavKind
}

function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw).trim().toLocaleLowerCase('tr-TR')
  } catch {
    return raw.trim().toLocaleLowerCase('tr-TR')
  }
}

function isOwnProfilePath(pathname: string, username: string): boolean {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'profil' && parts[0] !== 'profile' && parts[0] !== 'u') return false
  return decodeSlug(parts[1] ?? '') === username.trim().toLocaleLowerCase('tr-TR')
}

function isItemActive(pathname: string, item: MobileNavItem, username: string | null): boolean {
  if (item.kind === 'home') return resolveNewsSurface(pathname) === 'home'
  if (item.kind === 'akis') return resolveNewsSurface(pathname) === 'akis'
  if (item.kind === 'search') {
    return pathname === ROUTES.SEARCH || pathname.startsWith(`${ROUTES.SEARCH}/`) || pathname.startsWith('/search')
  }
  if (!username) return pathname.startsWith(ROUTES.SETTINGS_PROFILE)
  return isOwnProfilePath(pathname, username) || pathname.startsWith(ROUTES.SETTINGS_PROFILE)
}

function NavSlotChrome({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'relative flex h-11 w-11 items-center justify-center rounded-full transition-colors duration-150',
        active
          ? 'bg-[rgb(var(--color-text)/0.1)] text-[rgb(var(--color-text))] dark:bg-white/[0.16] dark:text-white'
          : 'text-[rgb(var(--color-text-secondary))] dark:text-white/90'
      )}
    >
      {children}
    </span>
  )
}

const MobileNavLink = memo(function MobileNavLink({
  item,
  active,
  pathname,
  pending,
  onPending,
}: {
  item: MobileNavItem
  active: boolean
  pathname: string
  pending: boolean
  onPending: (kind: NavKind) => void
}) {
  const { icon: Icon, label, href, testId, kind } = item

  const handleClick = useCallback(
    (e: MouseEvent<HTMLAnchorElement>) => {
      // A second tap while the first navigation is still loading restarted it
      // (and felt like "tap several times"). Keep the first one going.
      if (pending) {
        e.preventDefault()
        return
      }
      onPending(kind)
      if (kind === 'akis') {
        rememberFeedV2EntryOrigin(pathname)
        clearFeedRestoreForFeedV2Nav({ pathname })
      }
      logNavClick(href, pathname)
    },
    [href, kind, pathname, pending, onPending]
  )

  // Default (auto) prefetch: for dynamic routes such as /feed-v2 Next prefetches
  // only the loading.tsx shell, so a tap paints the Feed loader immediately
  // instead of waiting ~2 s for the server with no visible response.
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? 'page' : undefined}
      data-testid={testId}
      onClick={handleClick}
      className="flex flex-1 items-center justify-center touch-manipulation"
    >
      <NavSlotChrome active={active}>
        <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.25 : 1.75} />
      </NavSlotChrome>
    </Link>
  )
})

function MobileNavInner() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const categoryId = resolveSharedCategoryId(pathname, searchParams.toString())
  const signedIn = hydrated && !authLoading && Boolean(user)
  const username = signedIn ? user?.username || user?.uid || null : null
  const profileHref = username ? ROUTES.PROFILE(username) : ROUTES.LOGIN
  const profileItem: MobileNavItem = {
    icon: User,
    label: 'Profilim',
    href: profileHref,
    testId: 'header-nav-profil',
    kind: 'profil',
  }
  const profileActive = isItemActive(pathname, profileItem, username)
  const [pendingKind, setPendingKind] = useState<NavKind | null>(null)
  const [submitOpen, setSubmitOpen] = useState(false)

  // Navigation finished (or went elsewhere): drop the optimistic state.
  useEffect(() => {
    setPendingKind(null)
  }, [pathname])

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
        icon: Search,
        label: 'Ara',
        href: ROUTES.SEARCH,
        testId: 'header-nav-ara',
        kind: 'search',
      },
    ],
    [categoryId]
  )

  return (
    <>
    <nav
      className="mobile-bottom-nav pointer-events-none fixed inset-x-0 bottom-0 z-[105] flex justify-center px-[var(--mobile-nav-inset-x)] pb-[calc(var(--safe-bottom,0px)+var(--mobile-nav-float-gap))] lg:hidden"
      aria-label="Ana menü"
      data-testid="mobile-bottom-nav"
    >
      <div className="mobile-bottom-nav-pill pointer-events-auto" data-nav-member={signedIn ? '1' : '0'}>
        {items.map((item, index) => {
          const link = (
            <MobileNavLink
              key={item.kind}
              item={item}
              active={pendingKind ? pendingKind === item.kind : isItemActive(pathname, item, username)}
              pathname={pathname}
              pending={pendingKind === item.kind}
              onPending={setPendingKind}
            />
          )
          // Members: Ana Sayfa · Akış · [Haber Ekle] · Ara · Profil
          if (signedIn && index === 2) {
            return [
              <button
                key="add"
                type="button"
                aria-label="Haber Ekle"
                data-testid="mobile-nav-add-news"
                onClick={() => {
                  logNavClick('submit-news', pathname)
                  setSubmitOpen(true)
                }}
                className="flex flex-1 items-center justify-center touch-manipulation"
              >
                <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(var(--color-brand))] text-white shadow-[0_4px_14px_rgb(0_0_0_/_0.25)] transition-transform active:scale-95">
                  <Plus className="h-[22px] w-[22px]" strokeWidth={2.25} />
                </span>
              </button>,
              link,
            ]
          }
          return link
        })}
        {/* Guests see only Ana Sayfa · Akış · Ara. */}
        {signedIn && user ? (
        <Link
          href={profileHref}
          aria-label="Profilim"
          aria-current={profileActive ? 'page' : undefined}
          data-testid="header-nav-profil"
          onClick={() => {
            setPendingKind('profil')
            logNavClick(profileHref, pathname)
          }}
          className="flex flex-1 items-center justify-center touch-manipulation"
        >
          <span
            className={cn(
              'mobile-nav-profile',
              (pendingKind ? pendingKind === 'profil' : profileActive) && 'is-active',
              !signedIn && 'mobile-nav-profile-guest'
            )}
          >
            {signedIn && user ? (
              <Avatar
                name={user.displayName || user.username || 'Profil'}
                src={user.photoURL}
                size="sm"
                className="h-9 w-9 text-[11px]"
              />
            ) : (
              <User className="h-[22px] w-[22px]" strokeWidth={1.75} />
            )}
          </span>
        </Link>
        ) : null}
      </div>
    </nav>
    {/* Outside <nav>: it is pointer-events:none and its own stacking context. */}
    {submitOpen ? <SubmitNewsModal onClose={() => setSubmitOpen(false)} /> : null}
    </>
  )
}

export const MobileNav = memo(MobileNavInner)
