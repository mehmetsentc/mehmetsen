'use client'

import { useEffect, useState, type Ref } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Search, Menu, User } from 'lucide-react'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { CategoryNav } from './CategoryNav'
import { BackNavButton } from '@/components/layout/BackNavButton'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { useChromeOffset } from '@/hooks/useChromeOffset'
import { cn } from '@/lib/utils'

interface NavbarProps {
  onMenuClick?: () => void
}

export function Navbar({ onMenuClick }: NavbarProps = {}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [hydrated, setHydrated] = useState(false)
  const isFeed = pathname === ROUTES.FEED
  const isArticle = pathname.startsWith('/haber/')
  const showBack =
    !isFeed &&
    pathname !== ROUTES.HOME &&
    pathname !== '/' &&
    pathname !== ROUTES.REELS
  // Fixed chrome does not rubber-band with WKWebView overscroll (sticky does).
  const { ref: chromeRef, height: chromeHeight } = useChromeOffset(true)
  const isFeedV2 = pathname === '/feed-v2' || pathname.startsWith('/feed-v2/')

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
              'flex h-full items-center',
              isFeed ? 'gap-1 px-4' : 'gap-1.5 px-2 sm:px-3'
            )}
          >
            {showBack ? (
              <BackNavButton className="back-nav-btn--navbar back-nav-btn--on-brand" />
            ) : null}
            <button
              type="button"
              onClick={onMenuClick}
              className="flex h-11 w-11 shrink-0 items-center justify-center text-white"
              aria-label="Menü"
            >
              <Menu className="h-6 w-6" strokeWidth={2} />
            </button>

            {/* Logo — Theme D: Na beyaz + Haber brand kırmızı (kömür bar) */}
            <Link href={ROUTES.FEED} className="min-w-0 flex-1 px-1" aria-label="NaHaber">
              <BrandWordmark
                variant="onBrand"
                size={isFeed ? 'md' : 'sm'}
                className={cn('font-black', !isFeed && 'text-[1.45rem]')}
              />
            </Link>

            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={() => router.push(ROUTES.SEARCH)}
                className="flex h-11 w-11 items-center justify-center text-white touch-manipulation"
                aria-label="Ara"
              >
                <Search className={cn(isFeed ? 'h-[22px] w-[22px]' : 'h-5 w-5')} strokeWidth={2} />
              </button>
              <NotificationBell
                variant="onBrand"
                iconClassName={cn(isFeed ? 'h-[22px] w-[22px]' : 'h-5 w-5')}
              />
              <Link
                href={profileHref}
                className="flex h-11 w-11 items-center justify-center text-white touch-manipulation"
                aria-label="Profil"
              >
                <User className={cn(isFeed ? 'h-[22px] w-[22px]' : 'h-5 w-5')} strokeWidth={2} />
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
