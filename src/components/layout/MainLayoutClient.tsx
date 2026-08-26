'use client'

import { memo, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
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
import { logRouteChange } from '@/lib/navDiagnostics'
import { pauseAllPageVideos } from '@/lib/videoPlayback'
import { ROUTES, isPublicRoute } from '@/constants/routes'
import { CategorySwipeNavigator } from '@/components/layout/CategorySwipeNavigator'
import { DesktopSidebarToggle } from '@/components/layout/DesktopSidebarToggle'
import { DesktopGlobalScrollHeader } from '@/components/layout/DesktopGlobalScrollHeader'
import { GlobalBackNav } from '@/components/layout/BackNavButton'
import { ScrollHeaderProvider } from '@/context/ScrollHeaderContext'
import { cn } from '@/lib/utils'

const SiteFooter = dynamic(
  () => import('@/components/home/desktop/DesktopHomeFooter').then((m) => m.DesktopHomeFooter),
  { ssr: false, loading: () => null }
)

type ContentVariant = 'default' | 'wide' | 'newspaper' | 'reels' | 'messages'

function getContentVariant(pathname: string): ContentVariant {
  if (pathname === ROUTES.REELS) return 'reels'
  if (pathname.startsWith('/messages')) return 'messages'
  if (pathname.startsWith('/profile/')) return 'newspaper'
  if (pathname === ROUTES.FEED) return 'newspaper'
  if (pathname.startsWith('/kategori/')) return 'newspaper'
  if (pathname.startsWith('/etiket/')) return 'newspaper'
  if (pathname.startsWith('/haber/')) return 'newspaper'
  if (pathname.startsWith('/canli/')) return 'newspaper'
  if (pathname === ROUTES.LOCAL || pathname.startsWith(`${ROUTES.LOCAL}/`)) return 'newspaper'
  if (pathname.startsWith('/hukuk/')) return 'newspaper'
  if (pathname === '/kunye') return 'newspaper'
  if (pathname.startsWith('/iletisim')) return 'newspaper'
  if (pathname.startsWith('/hakkimizda')) return 'newspaper'
  if (pathname.startsWith('/editoryal-ilkeler')) return 'newspaper'
  if (pathname.startsWith('/aydinlatma-metni')) return 'newspaper'
  if (pathname === ROUTES.SITE_MAP) return 'newspaper'
  if (pathname === ROUTES.EVENTS || pathname.startsWith(`${ROUTES.EVENTS}/`)) return 'newspaper'
  return 'default'
}

function getStageClass(pathname: string, isReels: boolean, variant: ContentVariant): string {
  if (isReels) return 'content-stage-reels'
  if (variant === 'messages') return 'content-stage-messages'
  if (variant === 'wide') return 'content-stage-wide'
  if (variant === 'newspaper') return 'content-stage-newspaper'
  return ''
}

const LayoutShell = memo(function LayoutShell({
  children,
  pathname,
  isReels,
  variant,
  platform,
  isMobile,
  isDesktop,
}: {
  children: React.ReactNode
  pathname: string
  isReels: boolean
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

  return (
    <div className="min-h-screen bg-[rgb(var(--color-surface))]" data-platform={platform}>
      {/* Outside sticky/fixed chrome so WKWebView cannot paint feed into status bar. */}
      {!isReels ? <MobileSafeAreaShield /> : null}
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
        {/* Reels is immersive — floating GlobalBackNav replaces the top chrome. */}
        {!isReels ? <Navbar onMenuClick={() => setMobileDrawerOpen(true)} /> : null}

        <PullToRefresh>
          <div
            className={cn(
              'content-stage',
              getStageClass(pathname, isReels, variant)
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
              {variant === 'newspaper' && (
                <SiteFooter suppressNewsletter={suppressFooterNewsletter} />
              )}
            </main>
          </div>
        </PullToRefresh>
      </div>

      {/* Bottom navigation — mobile only, hidden on reels */}
      {!isReels && (
        <Suspense fallback={null}>
          <MobileNav />
        </Suspense>
      )}
    </div>
  )
})

function RouteEffects() {
  const pathname = usePathname()

  useEffect(() => {
    logRouteChange(pathname)
    pauseAllPageVideos()
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
  const isReels = pathname === ROUTES.REELS
  const variant = getContentVariant(pathname)
  const slim = isSlimAppShell(pathname)

  return (
    <AuthGuard requireAuth={!isPublic}>
      <UserLocationProvider>
        <AppStateProvider>
          <NetworkProvider>
            <ScrollHeaderProvider>
              <ReelsRouteTheme active={isReels} />
              <RouteEffects />
              <PageStateEffects />
              <UiEffects />
              <AuthIntentRunner />
              {!slim ? <CategorySwipeNavigator /> : null}
              <LayoutShell
                pathname={pathname}
                isReels={isReels}
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
