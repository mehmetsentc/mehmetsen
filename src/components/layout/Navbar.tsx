'use client'

import { useEffect, useState, type Ref } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, Plus, Search } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { pathIs, ROUTES } from '@/constants/routes'
import { CategoryNav } from './CategoryNav'
import { ContextRailSlot } from '@/components/layout/ContextRail'
import { BackNavButton } from '@/components/layout/BackNavButton'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { HeaderMoreMenu } from '@/components/layout/HeaderMoreMenu'
import { SubmitNewsModal } from '@/components/profile/SubmitNewsModal'
import { useChromeOffset } from '@/hooks/useChromeOffset'
import { resolveNewsSurface } from '@/lib/feed/sharedCategoryRail'
import { cn } from '@/lib/utils'

interface NavbarProps {
  onMenuClick?: () => void
}

function isAkis(pathname: string): boolean {
  return pathname === ROUTES.FEED_V2 || pathname.startsWith(`${ROUTES.FEED_V2}/`)
}

function isAra(pathname: string): boolean {
  return pathname.startsWith(ROUTES.SEARCH) || pathname.startsWith(ROUTES.SEARCH_TR)
}

function isProfil(pathname: string): boolean {
  return pathIs(pathname, '/profil', '/profile') || pathname.startsWith('/u/')
}

function isBildirim(pathname: string): boolean {
  return pathIs(pathname, ROUTES.NOTIFICATIONS, '/notifications')
}

export function Navbar({ onMenuClick }: NavbarProps = {}) {
  const { user } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [submitOpen, setSubmitOpen] = useState(false)
  const isHomeFeed = resolveNewsSurface(pathname) === 'home'
  const isArticle = pathname.startsWith('/haber/')
  const isFeedV2 = isAkis(pathname)
  const overlayFeed = isFeedV2
  const isPrimaryDest =
    isHomeFeed ||
    isFeedV2 ||
    isAra(pathname) ||
    isProfil(pathname) ||
    isBildirim(pathname) ||
    pathIs(pathname, ROUTES.MESSAGES, '/messages')
  const showBack =
    !isPrimaryDest &&
    pathname !== ROUTES.REELS &&
    pathname !== ROUTES.VIDEO
  const { ref: chromeRef, height: chromeHeight } = useChromeOffset(!overlayFeed)

  const showContextRail =
    isFeedV2 ||
    (pathname !== ROUTES.REELS &&
      pathname !== ROUTES.VIDEO &&
      !isArticle &&
      !isProfil(pathname) &&
      !pathIs(pathname, ROUTES.MESSAGES, '/messages') &&
      !pathname.startsWith('/admin') &&
      !pathname.startsWith('/post/'))
  const fallbackChromeHeight = showContextRail
    ? 'calc(max(var(--mobile-sat, 0px), env(safe-area-inset-top, 0px)) + var(--nahaber-header-row-height, 3.85rem) + var(--nahaber-context-rail-height, 3.15rem))'
    : 'calc(max(var(--mobile-sat, 0px), env(safe-area-inset-top, 0px)) + var(--nahaber-header-row-height, 3.85rem))'

  /**
   * Feed/reels shells use 100dvh-sized cards. When mobile top chrome is fixed +
   * spacer-pushed, raw 100dvh overflows the visible viewport and clips the
   * publisher/follow first-paint stack. Publish the spacer height as a CSS var
   * so `.content-main-reels` can size to the remaining band.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
    if (overlayFeed) {
      root.setAttribute('data-feed-overlay-chrome', '1')
      root.style.setProperty('--mobile-top-chrome-offset', '0px')
      return () => {
        root.removeAttribute('data-feed-overlay-chrome')
      }
    }
    const mq = window.matchMedia('(max-width: 1023px)')
    const apply = () => {
      if (!mq.matches) {
        root.style.setProperty('--mobile-top-chrome-offset', '0px')
        return
      }
      const value =
        chromeHeight > 0 ? `${chromeHeight}px` : fallbackChromeHeight
      root.style.setProperty('--mobile-top-chrome-offset', value)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => {
      mq.removeEventListener('change', apply)
      root.style.removeProperty('--mobile-top-chrome-offset')
    }
  }, [overlayFeed, chromeHeight, fallbackChromeHeight])

  const iconIdle = overlayFeed
    ? 'relative flex h-8 w-8 shrink-0 items-center justify-center touch-manipulation rounded-full bg-transparent text-white drop-shadow-[0_1px_6px_rgb(0_0_0_/_0.85)]'
    : 'relative flex h-12 w-12 shrink-0 items-center justify-center touch-manipulation rounded-full bg-transparent text-[rgb(var(--header-onbrand))]/70 transition-colors duration-150 hover:text-[rgb(var(--header-onbrand))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--header-onbrand))]/80'
  const iconActive = overlayFeed
    ? 'relative flex h-8 w-8 shrink-0 items-center justify-center touch-manipulation rounded-full bg-transparent text-white drop-shadow-[0_1px_6px_rgb(0_0_0_/_0.85)]'
    : 'relative flex h-12 w-12 shrink-0 items-center justify-center touch-manipulation rounded-full bg-transparent text-[rgb(var(--brand-500))] transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[rgb(var(--header-onbrand))]/80'
  const iconBtn = iconIdle

  function openSubmit() {
    if (!user) {
      router.push(`${ROUTES.LOGIN}?next=${encodeURIComponent(pathname || ROUTES.FEED)}`)
      return
    }
    setSubmitOpen(true)
  }

  return (
    <>
      <div
        ref={chromeRef as Ref<HTMLDivElement>}
        data-testid="global-header-chrome"
        data-feed-overlay-chrome={overlayFeed ? '1' : undefined}
        className={cn(
          'mobile-top-chrome is-fixed z-[100] lg:hidden',
          overlayFeed
            ? 'mobile-top-chrome--overlay text-white'
            : 'mobile-top-chrome--immersive text-[rgb(var(--header-onbrand))]',
          overlayFeed
            ? 'pt-[max(0.35rem,max(var(--mobile-sat,env(safe-area-inset-top,0px)),env(safe-area-inset-top,0px),64px))]'
            : 'pt-[max(var(--mobile-sat,0px),env(safe-area-inset-top,0px))]'
        )}
      >
        <header
          className={cn(
            'overflow-x-hidden',
            overlayFeed
              ? 'h-8 text-white'
              : 'h-[var(--nahaber-header-row-height,3.85rem)] text-[rgb(var(--header-onbrand))]'
          )}
        >
          <div className="flex h-full min-w-0 items-center justify-between gap-2 px-2.5 sm:gap-2.5 sm:px-3">
            <div className="flex min-w-0 items-center gap-0.5">
              {showBack ? (
                <BackNavButton className="back-nav-btn--navbar back-nav-btn--on-brand" />
              ) : null}
              <button
                type="button"
                onClick={onMenuClick}
                className={iconBtn}
                aria-label="Menüyü aç"
              >
                <Menu className={overlayFeed ? 'h-4 w-4' : 'h-6 w-6'} strokeWidth={overlayFeed ? 2 : 1.75} />
              </button>

              <Link
                href={ROUTES.FEED}
                className="shrink-0 px-1"
                aria-label="NaHaber"
              >
                <BrandWordmark
                  variant="onBrand"
                  size={overlayFeed ? 'sm' : 'md'}
                  className={
                    overlayFeed
                      ? 'font-extrabold !text-[1.05rem] drop-shadow-[0_1px_6px_rgb(0_0_0_/_0.85)]'
                      : 'font-extrabold !text-[1.28rem] min-[400px]:!text-[1.42rem] sm:!text-[1.55rem]'
                  }
                />
              </Link>
            </div>

            <div
              className="flex shrink-0 items-center gap-0.5 sm:gap-1"
              data-testid="header-primary-actions"
              data-testid-alias="global-nav-v2-icon-row"
            >
              <Link
                href={ROUTES.SEARCH}
                className={isAra(pathname) ? iconActive : iconIdle}
                aria-label="Ara"
                aria-current={isAra(pathname) ? 'page' : undefined}
                data-testid="header-nav-ara"
                data-nav-active={isAra(pathname) ? '1' : '0'}
              >
                <Search className={overlayFeed ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={isAra(pathname) ? 2.35 : 1.6} />
              </Link>
              <button
                type="button"
                className={iconIdle}
                aria-label="Haber Ekle"
                data-testid="header-action-plus"
                onClick={openSubmit}
              >
                <Plus className={overlayFeed ? 'h-4 w-4' : 'h-5 w-5'} strokeWidth={1.6} />
              </button>
              <HeaderMoreMenu
                isBildirim={isBildirim(pathname)}
                iconBtnClassName={iconIdle}
                onSubmitNews={openSubmit}
              />
            </div>
          </div>
        </header>

        {isFeedV2 ? <ContextRailSlot /> : <CategoryNav embedded />}
      </div>
      <div
        className="lg:hidden shrink-0"
        aria-hidden
        data-testid="mobile-chrome-spacer"
        style={{
          height: overlayFeed ? 0 : chromeHeight > 0 ? chromeHeight : fallbackChromeHeight,
        }}
      />
      {submitOpen ? <SubmitNewsModal onClose={() => setSubmitOpen(false)} /> : null}
    </>
  )
}
