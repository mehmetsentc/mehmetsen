'use client'

import { memo, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { usePathname, useRouter } from 'next/navigation'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { AuthIntentRunner } from '@/components/social/AuthIntentRunner'
import { Sidebar } from '@/components/layout/Sidebar'
import { Navbar } from '@/components/layout/Navbar'
import { MobileNav } from '@/components/layout/MobileNav'
import { MobileSafeAreaShield } from '@/components/layout/MobileSafeAreaShield'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { ReelsRouteTheme } from '@/components/theme/ReelsRouteTheme'
import { PageStateEffects } from '@/components/layout/PageStateEffects'
import { UiEffects } from '@/components/layout/UiEffects'
import { NetworkProvider } from '@/store/networkContext'
import { AppStateProvider } from '@/store/appStateContext'
import { UserLocationProvider } from '@/store/userLocationContext'
import { useUiStore } from '@/store/uiStore'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'
import { useSmartFeedReaderSurfaceActive } from '@/hooks/useSmartFeedReaderSurfaceActive'
import { logRouteChange } from '@/lib/navDiagnostics'
import { pauseAllPageVideos } from '@/lib/videoPlayback'
import { isPublicRoute, ROUTES } from '@/constants/routes'
import {
  isFeedImmersiveStage,
  isFeedV2Pathname,
  isGlobalNavV2Active,
  isImmersiveVideoPathname,
  isNewspaperDesktopVideo,
  isPublicVideoPathname,
  isReelsPathname,
  resolveMobileNavVisible,
  resolveTopNavbarVisible,
} from '@/lib/feed/reader/shellChrome'
import {
  clearFeedOwnerRescue,
  consumeFeedOwnerRescue,
} from '@/lib/feed/reader/feedOwnerRescue'
import { CategorySwipeNavigator } from '@/components/layout/CategorySwipeNavigator'
import { DesktopSidebarToggle } from '@/components/layout/DesktopSidebarToggle'
import { DesktopGlobalScrollHeader } from '@/components/layout/DesktopGlobalScrollHeader'
import { GlobalBackNav } from '@/components/layout/BackNavButton'
import { ScrollHeaderProvider } from '@/context/ScrollHeaderContext'
import { ContextRailSlotProvider } from '@/components/layout/ContextRail'
import { cn } from '@/lib/utils'

const SiteFooter = dynamic(
  () => import('@/components/home/desktop/DesktopHomeFooter').then((m) => m.DesktopHomeFooter),
  { ssr: false, loading: () => null }
)

type ContentVariant = 'default' | 'wide' | 'newspaper' | 'reels' | 'messages'

function getContentVariant(pathname: string, isDesktop: boolean): ContentVariant {
  if (isReelsPathname(pathname) || isFeedV2Pathname(pathname)) return 'reels'
  if (isPublicVideoPathname(pathname)) return isDesktop ? 'newspaper' : 'reels'
  if (pathname.startsWith('/messages')) return 'messages'
  if (pathname.startsWith('/admin')) return 'default'
  if (pathname.startsWith('/publisher-studio') || pathname.startsWith('/advertiser')) return 'default'
  if (pathname.startsWith('/settings') || pathname.startsWith('/saved') || pathname.startsWith('/notifications')) {
    return 'default'
  }
  if (pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/onboarding')) {
    return 'default'
  }
  return 'newspaper'
}

function getStageClass(pathname: string, immersiveStage: boolean, variant: ContentVariant): string {
  if (immersiveStage) return 'content-stage-reels'
  if (variant === 'messages') return 'content-stage-messages'
  if (variant === 'wide') return 'content-stage-wide'
  if (variant === 'newspaper') return 'content-stage-newspaper'
  return ''
}

const LayoutShell = memo(function LayoutShell({
  children,
  pathname,
  immersiveStage,
  showTopNavbar,
  showMobileNav,
  variant,
  platform,
  isMobile,
  isDesktop,
}: {
  children: React.ReactNode
  pathname: string
  immersiveStage: boolean
  showTopNavbar: boolean
  showMobileNav: boolean
  variant: ContentVariant
  platform: string
  isMobile: boolean
  isDesktop: boolean
}) {
  const drawerOpen = useUiStore((s) => s.mobileDrawerOpen)
  const setMobileDrawerOpen = useUiStore((s) => s.setMobileDrawerOpen)
  const desktopSidebarOpen = useUiStore((s) => s.desktopSidebarOpen)
  const setDesktopSidebarOpen = useUiStore((s) => s.setDesktopSidebarOpen)
  const suppressFooterNewsletter = pathname.startsWith('/haber/')
  const globalNavV2 = isGlobalNavV2Active()
  const newspaperVideo = isNewspaperDesktopVideo(pathname, isDesktop)
  const immersiveVideo = isImmersiveVideoPathname(pathname) && !newspaperVideo

  useEffect(() => {
    const root = document.documentElement
    if (immersiveVideo) root.setAttribute('data-immersive-video', '1')
    else root.removeAttribute('data-immersive-video')
    return () => {
      root.removeAttribute('data-immersive-video')
    }
  }, [immersiveVideo])

  return (
    <ContextRailSlotProvider>
    <div
      className="min-h-screen bg-[rgb(var(--color-surface))]"
      data-platform={platform}
      data-global-nav-v2={globalNavV2 ? '1' : '0'}
      data-feed-shell-chrome={showTopNavbar || showMobileNav ? 'visible' : 'hidden'}
      data-feed-mobile-nav={showMobileNav ? 'visible' : 'hidden'}
      data-immersive-video={immersiveVideo ? '1' : '0'}
      data-header-bleed="0"
    >
      {/* Outside sticky/fixed chrome so WKWebView cannot paint feed into status bar. */}
      {showTopNavbar ? <MobileSafeAreaShield /> : null}
      <Sidebar
        mobileOpen={drawerOpen}
        desktopOpen={desktopSidebarOpen}
        onMobileClose={() => setMobileDrawerOpen(false)}
        onDesktopClose={() => setDesktopSidebarOpen(false)}
      />
      <GlobalBackNav />
      <DesktopSidebarToggle />

      <div
        className={cn(
          'app-shell',
          isMobile && 'app-shell-mobile',
          isDesktop && 'app-shell-desktop'
        )}
      >
        {showTopNavbar ? <Navbar onMenuClick={() => setMobileDrawerOpen(true)} /> : null}

        <PullToRefresh>
          <div
            className={cn(
              'content-stage',
              getStageClass(pathname, immersiveStage, variant)
            )}
          >
            <a
              href="#main-content"
              className="skip-to-content hidden lg:inline-block"
            >
              İçeriğe atla
            </a>
            <main
              id="main-content"
              tabIndex={-1}
              className={cn(
                'content-main',
                variant === 'wide' && 'content-main-wide',
                variant === 'newspaper' && 'content-main-newspaper desktop-newspaper',
                variant === 'reels' && 'content-main-reels',
                variant === 'messages' && 'content-main-messages'
              )}
            >
              <DesktopGlobalScrollHeader />
              {children}
              {variant === 'newspaper' && !isPublicVideoPathname(pathname) && (
                <SiteFooter suppressNewsletter={suppressFooterNewsletter} />
              )}
            </main>
          </div>
        </PullToRefresh>
      </div>

      {showMobileNav ? (
        <Suspense fallback={null}>
          <MobileNav />
        </Suspense>
      ) : null}
    </div>
    </ContextRailSlotProvider>
  )
})

function RouteEffects() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    logRouteChange(pathname)
    pauseAllPageVideos()
  }, [pathname])

  // Reader close arm → if history skipped Feed onto HOME, restore owner.
  useEffect(() => {
    if (isFeedV2Pathname(pathname)) {
      clearFeedOwnerRescue()
      return
    }
    // Canonical /haber must never keep Feed Reader chrome lock — Navbar/Geri
    // would stay opacity:0 under the old global CSS selector.
    if (pathname.startsWith('/haber/') || pathname.startsWith('/post/')) {
      document.documentElement.classList.remove('smart-feed-reader-open')
      document.body.classList.remove('smart-feed-reader-open')
      return
    }
    if (pathname !== '/' && pathname !== '' && pathname !== ROUTES.FEED) return
    if (!consumeFeedOwnerRescue()) return
    document.documentElement.classList.remove('smart-feed-reader-open')
    document.body.classList.remove('smart-feed-reader-open')
    router.replace('/feed-v2')
  }, [pathname, router])

  // iOS Safari bfcache: returning to Feed can restore a document that still has
  // smart-feed-reader-open from a prior Reader session (cleanup never re-ran).
  useEffect(() => {
    if (!isFeedV2Pathname(pathname)) return
    const onPageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      if (document.documentElement.classList.contains('smart-feed-reader-open') ||
          document.body.classList.contains('smart-feed-reader-open')) {
        // SmartFeedClient also clears when readerSession is null; this covers
        // the case where Feed shell remounts without an active Reader child.
        document.documentElement.classList.remove('smart-feed-reader-open')
        document.body.classList.remove('smart-feed-reader-open')
      }
    }
    window.addEventListener('pageshow', onPageShow)
    return () => window.removeEventListener('pageshow', onPageShow)
  }, [pathname])

  return null
}

function isSlimAppShell(pathname: string): boolean {
  return (
    pathname.startsWith('/saved') ||
    pathname.startsWith('/settings') ||
    pathname.startsWith('/notifications') ||
    pathname.startsWith('/search') ||
    pathname.startsWith('/ara') ||
    pathname.startsWith('/oyunlar')
  )
}

export function MainLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { platform, isMobile, isDesktop } = usePlatformLayout()
  const isPublic = isPublicRoute(pathname)
  const readerSurfaceActive = useSmartFeedReaderSurfaceActive()
  const newspaperVideo = isNewspaperDesktopVideo(pathname, isDesktop)
  const immersiveStage = isFeedImmersiveStage(pathname) && !newspaperVideo
  const showTopNavbar = resolveTopNavbarVisible({
    pathname,
    readerSurfaceActive,
  })
  const showMobileNav = resolveMobileNavVisible({
    pathname,
    readerSurfaceActive,
  })
  const variant = getContentVariant(pathname, isDesktop)
  const slim = isSlimAppShell(pathname)

  return (
    <AuthGuard requireAuth={!isPublic}>
      <UserLocationProvider>
        <AppStateProvider>
          <NetworkProvider>
            <ScrollHeaderProvider>
              {/* Feed V2 stays dark-first; true /reels unchanged. */}
              <ReelsRouteTheme
                active={
                  isReelsPathname(pathname) ||
                  isFeedV2Pathname(pathname) ||
                  (isPublicVideoPathname(pathname) && !isDesktop)
                }
              />
              <RouteEffects />
              <PageStateEffects />
              <UiEffects />
              <AuthIntentRunner />
              {!slim ? <CategorySwipeNavigator /> : null}
              <LayoutShell
                pathname={pathname}
                immersiveStage={immersiveStage}
                showTopNavbar={showTopNavbar}
                showMobileNav={showMobileNav}
                variant={variant}
                platform={platform}
                isMobile={isMobile}
                isDesktop={isDesktop}
              >
                {children}
              </LayoutShell>
            </ScrollHeaderProvider>
          </NetworkProvider>
        </AppStateProvider>
      </UserLocationProvider>
    </AuthGuard>
  )
}
