'use client'

import { useEffect, useState, type Ref } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Menu, MessageCircle, Plus } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { CategoryNav } from './CategoryNav'
import { ContextRailSlot } from '@/components/layout/ContextRail'
import { BackNavButton } from '@/components/layout/BackNavButton'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { NavMessagesBadge } from '@/components/layout/NavMessagesBadge'
import { SubmitNewsModal } from '@/components/profile/SubmitNewsModal'
import { useChromeOffset } from '@/hooks/useChromeOffset'
import { clearFeedRestoreForFeedV2Nav } from '@/lib/feed/feedRestoration'
import { rememberFeedV2EntryOrigin } from '@/lib/feed/reader/feedV2Exit'
import { cn } from '@/lib/utils'

interface NavbarProps {
  onMenuClick?: () => void
}

function isAnaSayfa(pathname: string): boolean {
  return pathname === ROUTES.FEED || pathname === ROUTES.HOME || pathname === '/'
}

function isAkis(pathname: string): boolean {
  return pathname === ROUTES.FEED_V2 || pathname.startsWith(`${ROUTES.FEED_V2}/`)
}

function isAra(pathname: string): boolean {
  return pathname.startsWith(ROUTES.SEARCH) || pathname.startsWith(ROUTES.SEARCH_TR)
}

function isProfil(pathname: string): boolean {
  return pathname.startsWith('/profile/') || pathname.startsWith('/u/')
}

const DEST_LINK =
  'relative flex min-h-9 min-w-0 shrink items-center justify-center px-2.5 text-[13px] font-semibold tracking-tight whitespace-nowrap touch-manipulation transition-colors duration-150 sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80'

export function Navbar({ onMenuClick }: NavbarProps = {}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [hydrated, setHydrated] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const isHomeFeed = isAnaSayfa(pathname)
  const isArticle = pathname.startsWith('/haber/')
  const isFeedV2 = isAkis(pathname)
  const isPrimaryDest =
    isHomeFeed || isFeedV2 || isAra(pathname) || isProfil(pathname)
  const showBack =
    !isPrimaryDest &&
    pathname !== ROUTES.REELS
  const { ref: chromeRef, height: chromeHeight } = useChromeOffset(true)

  const showContextRail =
    isFeedV2 ||
    (pathname !== ROUTES.REELS &&
      !isArticle &&
      !isProfil(pathname) &&
      !pathname.startsWith('/messages') &&
      !pathname.startsWith('/admin') &&
      !pathname.startsWith('/post/'))
  // Overlay chrome: top row + dest toggle + shared context rail (same height on Ana Sayfa and Akış).
  const fallbackChromeHeight = showContextRail
    ? 'calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 2.75rem + 2.25rem + var(--nahaber-context-rail-height, 2.25rem))'
    : 'calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 2.75rem + 2.25rem)'

  useEffect(() => {
    setHydrated(true)
  }, [])

  /**
   * Feed/reels shells use 100dvh-sized cards. When mobile top chrome is fixed +
   * spacer-pushed, raw 100dvh overflows the visible viewport and clips the
   * publisher/follow first-paint stack. Publish the spacer height as a CSS var
   * so `.content-main-reels` can size to the remaining band.
   */
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement
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
  }, [chromeHeight, fallbackChromeHeight])

  const profileHref =
    hydrated && !loading && user
      ? ROUTES.PROFILE(user.username || user.uid)
      : ROUTES.LOGIN

  const iconBtn =
    'relative flex h-11 w-11 shrink-0 items-center justify-center touch-manipulation rounded-full text-white/90 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80'
  const actionBtn =
    'relative flex h-11 w-11 shrink-0 items-center justify-center touch-manipulation rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm transition-colors duration-150 hover:bg-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80'

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
        className={cn(
          'mobile-top-chrome mobile-top-chrome--immersive is-fixed z-[100] lg:hidden',
          'text-white',
          'pt-[var(--mobile-sat,env(safe-area-inset-top,0px))]'
        )}
      >
        <header className="h-11 bg-transparent text-white">
          <div className="flex h-full items-center gap-0.5 px-1.5 sm:px-2">
            {showBack ? (
              <BackNavButton className="back-nav-btn--navbar back-nav-btn--on-brand" />
            ) : null}
            <button
              type="button"
              onClick={onMenuClick}
              className={iconBtn}
              aria-label="Menüyü aç"
            >
              <Menu className="h-5 w-5" strokeWidth={2} />
            </button>

            <Link
              href={ROUTES.FEED}
              className="min-w-0 shrink px-0.5 sm:px-1"
              aria-label="NaHaber"
            >
              <BrandWordmark
                variant="onBrand"
                size="sm"
                className="font-black text-[1.25rem] sm:text-[1.4rem]"
              />
            </Link>

            <div className="ml-auto flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={openSubmit}
                className={actionBtn}
                aria-label="Haber Ekle"
                data-testid="header-action-plus"
              >
                <Plus className="h-[22px] w-[22px]" strokeWidth={2.25} />
              </button>
              <Link
                href={ROUTES.MESSAGES}
                className={actionBtn}
                aria-label="Mesajlar"
                data-testid="header-action-messages"
              >
                <MessageCircle className="h-5 w-5" strokeWidth={2} />
                <NavMessagesBadge size="md" />
              </Link>
            </div>
          </div>
        </header>

        <nav
          className="flex h-9 items-center justify-center gap-0.5 px-1 sm:gap-1 sm:px-2"
          aria-label="Ana gezinme"
          data-testid="header-dest-nav"
        >
          <Link
            href={ROUTES.FEED}
            className={cn(DEST_LINK, isHomeFeed ? 'text-white' : 'text-white/70 hover:text-white')}
            aria-label="Ana Sayfa"
            aria-current={isHomeFeed ? 'page' : undefined}
            data-testid="header-nav-ana-sayfa"
          >
            Ana Sayfa
            {isHomeFeed ? (
              <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-[rgb(var(--color-brand))]" />
            ) : null}
          </Link>
          <Link
            href={ROUTES.FEED_V2}
            onClick={() => {
              rememberFeedV2EntryOrigin(pathname)
              clearFeedRestoreForFeedV2Nav({ pathname })
            }}
            className={cn(DEST_LINK, isFeedV2 ? 'text-white' : 'text-white/70 hover:text-white')}
            aria-label="Akış"
            aria-current={isFeedV2 ? 'page' : undefined}
            data-testid="header-nav-akis"
          >
            Akış
            {isFeedV2 ? (
              <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-[rgb(var(--color-brand))]" />
            ) : null}
          </Link>
          <Link
            href={ROUTES.SEARCH}
            className={cn(DEST_LINK, isAra(pathname) ? 'text-white' : 'text-white/70 hover:text-white')}
            aria-label="Ara"
            aria-current={isAra(pathname) ? 'page' : undefined}
            data-testid="header-nav-ara"
          >
            Ara
            {isAra(pathname) ? (
              <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-[rgb(var(--color-brand))]" />
            ) : null}
          </Link>
          <Link
            href={profileHref}
            className={cn(DEST_LINK, isProfil(pathname) ? 'text-white' : 'text-white/70 hover:text-white')}
            aria-label="Profil"
            aria-current={isProfil(pathname) ? 'page' : undefined}
            data-testid="header-nav-profil"
          >
            Profil
            {isProfil(pathname) ? (
              <span className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-[rgb(var(--color-brand))]" />
            ) : null}
          </Link>
        </nav>

        {isFeedV2 ? <ContextRailSlot /> : <CategoryNav embedded />}
      </div>
      <div
        className="lg:hidden shrink-0"
        aria-hidden
        style={{
          height: chromeHeight > 0 ? chromeHeight : fallbackChromeHeight,
        }}
      />
      {submitOpen ? <SubmitNewsModal onClose={() => setSubmitOpen(false)} /> : null}
    </>
  )
}
