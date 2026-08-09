'use client'

import { memo, Suspense } from 'react'
import { CityTenantProvider } from '@/store/cityTenantContext'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { NetworkProvider } from '@/store/networkContext'
import { AppStateProvider } from '@/store/appStateContext'
import { UserLocationProvider } from '@/store/userLocationContext'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { CityNavbar } from './CityNavbar'
import { CitySectionNav } from './CitySectionNav'
import { CityCategoryNav } from './CityCategoryNav'
import { CityMobileNav } from './CityMobileNav'
import { CityCategoryProvider } from '@/store/cityCategoryContext'
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
  return (
    <CityCategoryProvider categories={categories}>
      <div className="min-h-screen bg-[rgb(var(--color-surface))]">
        <CityNavbar cityName={displayName} provinceSlug={provinceSlug} />
        <CitySectionNav />
        <CityCategoryNav />

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
    </CityCategoryProvider>
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
            <CityTenantProvider
              tenant={{ slug: tenantSlug, displayName, provinceSlug }}
            >
              <CityShell
                displayName={displayName}
                provinceSlug={provinceSlug}
                categories={categories}
              >
                {children}
              </CityShell>
            </CityTenantProvider>
          </NetworkProvider>
        </AppStateProvider>
      </UserLocationProvider>
    </AuthGuard>
  )
}
