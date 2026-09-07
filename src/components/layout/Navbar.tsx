'use client'

import { useEffect, useState, type Ref } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Menu, User, Home, Zap } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { CategoryNav } from './CategoryNav'
import { BackNavButton } from '@/components/layout/BackNavButton'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { useChromeOffset } from '@/hooks/useChromeOffset'
import { clearFeedRestore } from '@/lib/feed/feedRestoration'
import { cn } from '@/lib/utils'

interface NavbarProps {
  onMenuClick?: () => void
}

export function Navbar({ onMenuClick }: NavbarProps = {}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [hydrated, setHydrated] = useState(false)
  const isHomeFeed =
    pathname === ROUTES.FEED || pathname === ROUTES.HOME || pathname === '/'
  const isFeed = pathname === ROUTES.FEED
  const isArticle = pathname.startsWith('/haber/')
  const isFeedV2 = pathname === '/feed-v2' || pathname.startsWith('/feed-v2/')
  const showBack =
    !isHomeFeed &&
    pathname !== ROUTES.REELS &&
    !isFeedV2
  // Fixed chrome does not rubber-band with WKWebView overscroll (sticky does).
  const { ref: chromeRef, height: chromeHeight } = useChromeOffset(true)

  useEffect(() => {
    setHydrated(true)
  }, [])

  const profileHref =
    hydrated && !loading && user
      ? ROUTES.PROFILE(user.username || user.uid)
      : ROUTES.LOGIN

  // SSR / first-paint spacer — articles hide CategoryNav (see CategoryNav hide list).
  // Feed V2: brand bar only (Feed owns its category chips) — shorter spacer.
  const fallbackChromeHeight = isFeed
    ? 'calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 72px + 48px)'
    : isArticle || isFeedV2
      ? 'calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 3.5rem)'
      : 'calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 3.5rem + 48px)'

  const iconBtn =
    'flex h-11 w-11 shrink-0 items-center justify-center touch-manipulation transition-colors'
  const iconActive = 'rounded-full bg-white/20 text-white'
  const iconIdle = 'text-white/85 hover:text-white'

  return (
    <>
      <div
        ref={chromeRef as Ref<HTMLDivElement>}
        className={cn(
          'mobile-top-chrome is-fixed z-[100] lg:hidden',
          'bg-[rgb(var(--header-brand-bg))] text-white',
          // --mobile-sat falls back to env(safe-area-inset-top); Capacitor iOS bumps min 47px.
          'pt-[var(--mobile-sat,env(safe-area-inset-top,0px))]'
        )}
      >
        <header
          className={cn(
            'bg-[rgb(var(--header-brand-bg))] text-white',
            isFeed ? 'h-[72px]' : 'h-14'
          )}
        >
          <div
            className={cn(
              'flex h-full items-center gap-0.5 px-1.5 sm:gap-1 sm:px-2',
              isFeed && 'sm:px-3'
            )}
          >
            {showBack ? (
              <BackNavButton className="back-nav-btn--navbar back-nav-btn--on-brand" />
            ) : null}
            <button
              type="button"
              onClick={onMenuClick}
              className={iconBtn}
              aria-label="Menüyü aç"
            >
              <Menu className="h-6 w-6" strokeWidth={2} />
            </button>

            {/* Logo — Theme D: Na beyaz + Haber brand kırmızı (kömür bar) */}
            <Link
              href={ROUTES.FEED}
              className="min-w-0 shrink px-0.5 sm:px-1"
              aria-label="NaHaber"
            >
              <BrandWordmark
                variant="onBrand"
                size="sm"
                className={cn('font-black text-[1.25rem] sm:text-[1.4rem]', isFeed && 'sm:text-[1.5rem]')}
              />
            </Link>

            <div className="ml-auto flex shrink-0 items-center">
              <Link
                href={ROUTES.FEED}
                className={cn(iconBtn, isHomeFeed ? iconActive : iconIdle)}
                aria-label="Ana Feed"
                aria-current={isHomeFeed ? 'page' : undefined}
                data-testid="header-nav-ana-feed"
              >
                <Home className="h-5 w-5" strokeWidth={isHomeFeed ? 2.35 : 2} />
              </Link>
              <Link
                href={ROUTES.FEED_V2}
                onClick={() => clearFeedRestore()}
                className={cn(iconBtn, isFeedV2 ? iconActive : iconIdle)}
                aria-label="Feed V2"
                aria-current={isFeedV2 ? 'page' : undefined}
                data-testid="header-nav-feed-v2"
              >
                <Zap className="h-5 w-5" strokeWidth={isFeedV2 ? 2.35 : 2} />
              </Link>
              <button
                type="button"
                onClick={() => router.push(ROUTES.SEARCH)}
                className={cn(iconBtn, iconIdle)}
                aria-label="Ara"
              >
                <Search className="h-5 w-5" strokeWidth={2} />
              </button>
              <NotificationBell variant="onBrand" iconClassName="h-5 w-5" />
              <Link
                href={profileHref}
                className={cn(iconBtn, iconIdle)}
                aria-label="Profil"
              >
                <User className="h-5 w-5" strokeWidth={2} />
              </Link>
            </div>
          </div>
        </header>

        {/* Embedded in chrome so category bar shares one fixed stack (no dual-sticky gap). */}
        <CategoryNav embedded />
      </div>
      <div
        className="lg:hidden shrink-0"
        aria-hidden
        style={{
          height: chromeHeight > 0 ? chromeHeight : fallbackChromeHeight,
        }}
      />
    </>
  )
}
