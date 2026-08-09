'use client'

import { memo, Suspense } from 'react'
import { CityTenantProvider } from '@/store/cityTenantContext'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { NetworkProvider } from '@/store/networkContext'
import { AppStateProvider } from '@/store/appStateContext'
import { UserLocationProvider } from '@/store/userLocationContext'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { ScrollHeaderProvider } from '@/context/ScrollHeaderContext'
import { CityNavbar } from './CityNavbar'
import { CitySectionNav } from './CitySectionNav'
import { CityMobileNav } from './CityMobileNav'

interface CityLayoutClientProps {
  tenantSlug: string
  displayName: string
  provinceSlug: string
  children: React.ReactNode
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
  return (
    <div className="min-h-screen bg-[rgb(var(--color-surface))]">
      <CityNavbar cityName={displayName} provinceSlug={provinceSlug} />
      <CitySectionNav />

      <PullToRefresh>
        <main
          id="main-content"
          tabIndex={-1}
          className="content-main content-main-newspaper desktop-newspaper"
        >
          {children}
        </main>
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
                <CityShell displayName={displayName} provinceSlug={provinceSlug}>
                  {children}
                </CityShell>
              </CityTenantProvider>
            </ScrollHeaderProvider>
          </NetworkProvider>
        </AppStateProvider>
      </UserLocationProvider>
    </AuthGuard>
  )
}
