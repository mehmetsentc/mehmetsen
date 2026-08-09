'use client'

import { memo, Suspense } from 'react'
import { usePathname } from 'next/navigation'
import { CityTenantProvider } from '@/store/cityTenantContext'
import { AuthGuard } from '@/components/auth/AuthGuard'
import { NetworkProvider } from '@/store/networkContext'
import { AppStateProvider } from '@/store/appStateContext'
import { UserLocationProvider } from '@/store/userLocationContext'
import { PullToRefresh } from '@/components/ui/PullToRefresh'
import { CityHeader } from './CityHeader'
import { CityMobileNav } from './CityMobileNav'
import { cn } from '@/lib/utils'

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
      <CityHeader cityName={displayName} provinceSlug={provinceSlug} />

      <PullToRefresh>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-2xl px-4 pb-24 pt-4"
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
  const pathname = usePathname()

  return (
    <AuthGuard requireAuth={false}>
      <UserLocationProvider>
        <AppStateProvider>
          <NetworkProvider>
            <CityTenantProvider
              tenant={{ slug: tenantSlug, displayName, provinceSlug }}
            >
              <CityShell displayName={displayName} provinceSlug={provinceSlug}>
                {children}
              </CityShell>
            </CityTenantProvider>
          </NetworkProvider>
        </AppStateProvider>
      </UserLocationProvider>
    </AuthGuard>
  )
}
