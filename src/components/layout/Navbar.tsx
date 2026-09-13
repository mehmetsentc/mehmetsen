'use client'

import { useEffect, useState, type Ref } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Menu, MessageCircle, Plus, Search, User } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { ROUTES } from '@/constants/routes'
import { CategoryNav } from './CategoryNav'
import { ContextRailSlot } from '@/components/layout/ContextRail'
import { BackNavButton } from '@/components/layout/BackNavButton'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { NavMessagesBadge } from '@/components/layout/NavMessagesBadge'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import { SubmitNewsModal } from '@/components/profile/SubmitNewsModal'
import { useChromeOffset } from '@/hooks/useChromeOffset'
import { clearFeedRestoreForFeedV2Nav } from '@/lib/feed/feedRestoration'
import { rememberFeedV2EntryOrigin } from '@/lib/feed/reader/feedV2Exit'
import {
  hrefForNewsSurface,
  resolveNewsSurface,
  resolveSharedCategoryId,
} from '@/lib/feed/sharedCategoryRail'
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
  return pathname.startsWith('/profile/') || pathname.startsWith('/u/')
}

function isBildirim(pathname: string): boolean {
  return pathname.startsWith(ROUTES.NOTIFICATIONS)
}

export function Navbar({ onMenuClick }: NavbarProps = {}) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [hydrated, setHydrated] = useState(false)
  const [submitOpen, setSubmitOpen] = useState(false)
  const isHomeFeed = resolveNewsSurface(pathname) === 'home'
  const isArticle = pathname.startsWith('/haber/')
  const isFeedV2 = isAkis(pathname)
  const isPrimaryDest =
    isHomeFeed ||
    isFeedV2 ||
    isAra(pathname) ||
    isProfil(pathname) ||
    isBildirim(pathname) ||
    pathname.startsWith('/messages')
  const showBack =
    !isPrimaryDest &&
    pathname !== ROUTES.REELS &&
    pathname !== ROUTES.VIDEO
  const { ref: chromeRef, height: chromeHeight } = useChromeOffset(true)

  const showContextRail =
    isFeedV2 ||
    (pathname !== ROUTES.REELS &&
      pathname !== ROUTES.VIDEO &&
      !isArticle &&
      !isProfil(pathname) &&
      !pathname.startsWith('/messages') &&
      !pathname.startsWith('/admin') &&
      !pathname.startsWith('/post/'))
  // Overlay chrome: one header row + shared context rail (destination row removed).
  const fallbackChromeHeight = showContextRail
    ? 'calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 2.75rem + var(--nahaber-context-rail-height, 2.25rem))'
    : 'calc(var(--mobile-sat, env(safe-area-inset-top, 0px)) + 2.75rem)'

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
    'relative flex h-8 w-8 shrink-0 items-center justify-center touch-manipulation rounded-full text-white/90 transition-colors duration-150 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 after:absolute after:inset-[-6px]'
  const actionBtn =
    'relative flex h-8 w-8 shrink-0 items-center justify-center touch-manipulation rounded-full bg-white/15 text-white ring-1 ring-white/25 backdrop-blur-sm transition-colors duration-150 hover:bg-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/80 after:absolute after:inset-[-6px]'

  function openSubmit() {
    if (!user) {
      router.push(`${ROUTES.LOGIN}?next=${encodeURIComponent(pathname || ROUTES.FEED)}`)
      return
    }
    setSubmitOpen(true)
  }

  const categoryId = resolveSharedCategoryId(pathname, searchParams.toString())
  const anaHref = hrefForNewsSurface('home', categoryId)
  const akisHref = hrefForNewsSurface('akis', categoryId)

  return (
    <>
      <div
        ref={chromeRef as Ref<HTMLDivElement>}
        data-testid="global-header-chrome"
        className={cn(
          'mobile-top-chrome mobile-top-chrome--immersive is-fixed z-[100] lg:hidden',
          'overflow-x-hidden text-white',
          'pt-[var(--mobile-sat,env(safe-area-inset-top,0px))]'
        )}
      >
        <header className="h-11 overflow-x-hidden bg-transparent text-white">
          <div className="flex h-full min-w-0 items-center gap-0 px-1">
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
              className="min-w-0 shrink px-0.5"
              aria-label="NaHaber"
            >
              <BrandWordmark
                variant="onBrand"
                size="sm"
                className="font-black text-[1.05rem] sm:text-[1.25rem]"
              />
            </Link>

            <div
              className="header-surface-toggle mx-0.5 min-w-0 shrink"
              role="group"
              aria-label="Yüzey"
              data-testid="header-surface-toggle"
            >
              <Link
                href={anaHref}
                className={cn(
                  'header-surface-toggle__opt',
                  isHomeFeed && 'is-active'
                )}
                aria-label="Ana Sayfa"
                aria-current={isHomeFeed ? 'page' : undefined}
                data-testid="header-nav-ana-sayfa"
              >
                Ana Sayfa
              </Link>
              <Link
                href={akisHref}
                onClick={() => {
                  rememberFeedV2EntryOrigin(pathname)
                  clearFeedRestoreForFeedV2Nav({ pathname })
                }}
                className={cn(
                  'header-surface-toggle__opt',
                  isFeedV2 && 'is-active'
                )}
                aria-label="Akış"
                aria-current={isFeedV2 ? 'page' : undefined}
                data-testid="header-nav-akis"
              >
                Akış
              </Link>
            </div>

            <div className="ml-auto flex min-w-0 shrink-0 items-center gap-0">
              <Link
                href={ROUTES.SEARCH}
                className={iconBtn}
                aria-label="Ara"
                aria-current={isAra(pathname) ? 'page' : undefined}
                data-testid="header-nav-ara"
              >
                <Search className="h-4 w-4" strokeWidth={2.25} />
              </Link>
              <NotificationBell
                variant="onBrand"
                iconClassName="h-4 w-4"
                buttonClassName={cn(
                  iconBtn,
                  isBildirim(pathname) && 'text-white'
                )}
              />
              <Link
                href={profileHref}
                className={iconBtn}
                aria-label="Profil"
                aria-current={isProfil(pathname) ? 'page' : undefined}
                data-testid="header-nav-profil"
              >
                <User className="h-4 w-4" strokeWidth={2.25} />
              </Link>
              <button
                type="button"
                onClick={openSubmit}
                className={actionBtn}
                aria-label="Haber Ekle"
                data-testid="header-action-plus"
              >
                <Plus className="h-[18px] w-[18px]" strokeWidth={2.25} />
              </button>
              <Link
                href={ROUTES.MESSAGES}
                className={actionBtn}
                aria-label="Mesajlar"
                data-testid="header-action-messages"
              >
                <MessageCircle className="h-4 w-4" strokeWidth={2} />
                <NavMessagesBadge size="sm" />
              </Link>
            </div>
          </div>
        </header>

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
