'use client'

import { memo, Suspense, useCallback, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { CityTenantProvider } from '@/store/cityTenantContext'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { NetworkProvider } from '@/store/networkContext'
import { AppStateProvider } from '@/store/appStateContext'
import { UserLocationProvider } from '@/store/userLocationContext'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { ScrollHeaderProvider } from '@/context/ScrollHeaderContext'
import { UiEffects } from '@/components/layout/UiEffects'
import { CityCategoryProvider } from '@/store/cityCategoryContext'
import { useUiStore } from '@/store/uiStore'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'
import { MobileSafeAreaShield } from '@/components/layout/MobileSafeAreaShield'
import { CityNavbar } from './CityNavbar'
import { CityMobileNav } from './CityMobileNav'
import { CitySidebar } from './CitySidebar'
import { CityFooter } from './CityFooter'
import type { CityCategory } from '@/services/cityNewsService.server'
import { isCityFeedPath } from '@/lib/cityPaths'

interface CityLayoutClientProps {
  tenantSlug: string
  displayName: string
  provinceSlug: string
  categories: CityCategory[]
  hasSpor?: boolean
  children: React.ReactNode
}

/** Scroll to category rail when landing on feed with a hash (sidebar deep links). */
function CityCategoryHashScroll() {
  const pathname = usePathname()

  useEffect(() => {
    if (!isCityFeedPath(pathname)) return
    const hash = window.location.hash
    if (!hash.startsWith('#category-rail-')) return

    const targetId = hash.slice(1)
    const scrollToTarget = () => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    scrollToTarget()
    const retry = window.setTimeout(scrollToTarget, 800)
    return () => window.clearTimeout(retry)
  }, [pathname])

  return null
}

const CityShell = memo(function CityShell({
  displayName,
  provinceSlug,
  children,
}: {
  displayName: string
  provinceSlug: string
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const suppressFooterNewsletter = pathname.startsWith('/haber/')
  const { isDesktop } = usePlatformLayout()
  const drawerOpen = useUiStore((s) => s.mobileDrawerOpen)
  const setMobileDrawerOpen = useUiStore((s) => s.setMobileDrawerOpen)
  const desktopSidebarOpen = useUiStore((s) => s.desktopSidebarOpen)
  const setDesktopSidebarOpen = useUiStore((s) => s.setDesktopSidebarOpen)
  const toggleDesktopSidebar = useUiStore((s) => s.toggleDesktopSidebar)

  const handleMenuClick = useCallback(() => {
    if (isDesktop) {
      toggleDesktopSidebar()
    } else {
      setMobileDrawerOpen(true)
    }
  }, [isDesktop, toggleDesktopSidebar, setMobileDrawerOpen])

  return (
    <div className="min-h-screen bg-[rgb(var(--color-surface))]">
      <MobileSafeAreaShield />
      <CitySidebar
        cityName={displayName}
        provinceSlug={provinceSlug}
        mobileOpen={drawerOpen}
        desktopOpen={desktopSidebarOpen}
        onMobileClose={() => setMobileDrawerOpen(false)}
        onDesktopClose={() => setDesktopSidebarOpen(false)}
      />

      <CityNavbar
        cityName={displayName}
        provinceSlug={provinceSlug}
        onMenuClick={handleMenuClick}
      />

      <PullToRefresh>
        <div className="content-stage content-stage-newspaper">
          <main
            id="main-content"
            tabIndex={-1}
            className="content-main content-main-newspaper desktop-newspaper"
          >
            {children}
          </main>
          <div className="content-main content-main-newspaper desktop-newspaper pb-6">
            <CityFooter
              cityName={displayName}
              provinceSlug={provinceSlug}
              suppressNewsletter={suppressFooterNewsletter}
            />
          </div>
        </div>
      </PullToRefresh>

      <Suspense fallback={null}>
        <CityMobileNav />
      </Suspense>
    </div>
  )
})

export function CityLayoutClient({
  tenantSlug,
  displayName,
  provinceSlug,
  categories,
  hasSpor = false,
  children,
}: CityLayoutClientProps) {
  return (
    <AuthGuard requireAuth={false}>
      <UserLocationProvider>
        <AppStateProvider>
          <NetworkProvider>
            <ScrollHeaderProvider>
              <CityTenantProvider
                tenant={{ slug: tenantSlug, displayName, provinceSlug }}
              >
                <CityCategoryProvider categories={categories} hasSpor={hasSpor}>
                  <UiEffects />
                  <CityCategoryHashScroll />
                  <CityShell
                    displayName={displayName}
                    provinceSlug={provinceSlug}
                  >
                    {children}
                  </CityShell>
                </CityCategoryProvider>
              </CityTenantProvider>
            </ScrollHeaderProvider>
          </NetworkProvider>
        </AppStateProvider>
      </UserLocationProvider>
    </AuthGuard>
  )
}
