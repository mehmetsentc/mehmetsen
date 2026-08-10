'use client'

import { memo, Suspense, useCallback } from 'react'
import { CityTenantProvider } from '@/store/cityTenantContext'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { NetworkProvider } from '@/store/networkContext'
import { AppStateProvider } from '@/store/appStateContext'
import { UserLocationProvider } from '@/store/userLocationContext'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { ScrollHeaderProvider } from '@/context/ScrollHeaderContext'
import { CityCategoryProvider } from '@/store/cityCategoryContext'
import { useUiStore } from '@/store/uiStore'
import { usePlatformLayout } from '@/hooks/usePlatformLayout'
import { CityNavbar } from './CityNavbar'
import { CitySectionNav } from './CitySectionNav'
import { CityMobileNav } from './CityMobileNav'
import { CitySidebar } from './CitySidebar'
import type { CityCategory } from '@/services/cityNewsService.server'

interface CityLayoutClientProps {
  tenantSlug: string
  displayName: string
  provinceSlug: string
  categories: CityCategory[]
  children: React.ReactNode
}

const CityShell = memo(function CityShell({
  displayName,
  provinceSlug,
  categories,
  children,
}: {
  displayName: string
  provinceSlug: string
  categories: CityCategory[]
  children: React.ReactNode
}) {
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
      <CitySidebar
        cityName={displayName}
        provinceSlug={provinceSlug}
        categories={categories}
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
      <CitySectionNav />

      <PullToRefresh>
        <div className="content-stage content-stage-newspaper">
          <main
            id="main-content"
            tabIndex={-1}
            className="content-main content-main-newspaper desktop-newspaper"
          >
            {children}
          </main>
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
                <CityCategoryProvider categories={categories}>
                  <CityShell
                    displayName={displayName}
                    provinceSlug={provinceSlug}
                    categories={categories}
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
