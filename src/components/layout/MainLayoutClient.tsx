'use client'

import { memo, useEffect, Suspense } from 'react'
import dynamic from 'next/dynamic'
import { usePathname } from 'next/navigation'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { Sidebar } from '@/components/layout/Sidebar'
import { Navbar } from '@/components/layout/Navbar'
import { MobileNav } from '@/components/layout/MobileNav'
import { ConsentStrip } from '@/components/consent/ConsentStrip'
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
import { cn } from '@/lib/utils'

const TrendingPanel = dynamic(
  () => import('@/components/feed/TrendingPanel').then((m) => m.TrendingPanel),
  { ssr: false, loading: () => null }
)

type ContentVariant = 'default' | 'wide' | 'reels' | 'messages'

function getContentVariant(pathname: string): ContentVariant {
  if (pathname === ROUTES.REELS) return 'reels'
  if (pathname.startsWith('/messages')) return 'messages'
  if (pathname.startsWith('/profile/')) return 'wide'
  return 'default'
}

function getStageClass(pathname: string, isFeed: boolean, isReels: boolean, variant: ContentVariant): string {
  if (isFeed) return 'content-stage-with-rail'
  if (isReels) return 'content-stage-reels'
  if (variant === 'messages') return 'content-stage-messages'
  if (variant === 'wide') return 'content-stage-wide'
  return ''
}

const LayoutShell = memo(function LayoutShell({
  children,
  pathname,
  isFeed,
  isReels,
  variant,
  platform,
  isMobile,
  isDesktop,
}: {
  children: React.ReactNode
  pathname: string
  isFeed: boolean
  isReels: boolean
  variant: ContentVariant
  platform: string
  isMobile: boolean
  isDesktop: boolean
}) {
  const drawerOpen = useUiStore((s) => s.mobileDrawerOpen)
  const setMobileDrawerOpen = useUiStore((s) => s.setMobileDrawerOpen)

  return (
    <div className="min-h-screen bg-[rgb(var(--color-surface))]" data-platform={platform}>
      <Sidebar
        mobileOpen={drawerOpen}
        onMobileClose={() => setMobileDrawerOpen(false)}
      />

      <div
        className={cn(
          'app-shell',
          isMobile && 'app-shell-mobile',
          isDesktop && 'app-shell-desktop'
        )}
      >
        <Navbar onMenuClick={() => setMobileDrawerOpen(true)} />

        <PullToRefresh>
          <div
            className={cn(
              'content-stage',
              getStageClass(pathname, isFeed, isReels, variant)
            )}
          >
            <main
              className={cn(
                'content-main',
                variant === 'wide' && 'content-main-wide',
                variant === 'reels' && 'content-main-reels',
                variant === 'messages' && 'content-main-messages'
              )}
            >
              {children}
            </main>
            {isFeed && <TrendingPanel />}
          </div>
        </PullToRefresh>
      </div>

      <ConsentStrip />

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

export function MainLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const { platform, isMobile, isDesktop } = usePlatformLayout()
  const isPublic = isPublicRoute(pathname)
  const isReels = pathname === ROUTES.REELS
  const isFeed = pathname === ROUTES.FEED
  const variant = getContentVariant(pathname)

  return (
    <AuthGuard requireAuth={!isPublic}>
      <UserLocationProvider>
        <AppStateProvider>
          <NetworkProvider>
            <ReelsRouteTheme active={isReels} />
            <RouteEffects />
            <PageStateEffects />
            <UiEffects />
            <LayoutShell
              pathname={pathname}
              isFeed={isFeed}
              isReels={isReels}
              variant={variant}
              platform={platform}
              isMobile={isMobile}
              isDesktop={isDesktop}
            >
              {children}
            </LayoutShell>
          </NetworkProvider>
        </AppStateProvider>
      </UserLocationProvider>
    </AuthGuard>
  )
}
