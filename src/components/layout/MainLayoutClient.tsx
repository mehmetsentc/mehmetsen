'use client'

import { memo, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { TrendingPanel } from '@/components/feed/TrendingPanel'
import { ConsentBanner } from '@/components/consent/ConsentBanner'
import { ReelsRouteTheme } from '@/components/theme/ReelsRouteTheme'
import { NetworkProvider } from '@/store/networkContext'
import { AppStateProvider } from '@/store/appStateContext'
import { UserLocationProvider } from '@/store/userLocationContext'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'
import { logRouteChange } from '@/lib/navDiagnostics'
import { pauseAllPageVideos } from '@/lib/videoPlayback'
import { ROUTES, isPublicRoute } from '@/constants/routes'
import { cn } from '@/lib/utils'

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
  return (
    <div className="min-h-screen bg-[rgb(var(--color-surface))]" data-platform={platform}>
      <Sidebar />

      <div
        className={cn(
          'app-shell',
          isMobile && 'app-shell-mobile',
          isDesktop && 'app-shell-desktop'
        )}
      >
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
      </div>

      <MobileNav />
      <ConsentBanner />
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
