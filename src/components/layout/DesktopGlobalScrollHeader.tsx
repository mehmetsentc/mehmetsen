'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { DesktopScrollHeader } from '@/components/home/desktop/DesktopScrollHeader'
import { CityDesktopNewspaperHeader } from '@/components/city/CityDesktopNewspaperHeader'
import { CityTenantProvider } from '@/store/cityTenantContext'
import { useScrollHeaderContext } from '@/context/ScrollHeaderContext'
import { readLocalCityTenant } from '@/lib/tenant'
import { ROUTES } from '@/constants/routes'

function shouldShowGlobalScrollHeader(pathname: string): boolean {
  if (pathname === ROUTES.REELS || pathname === '/video' || pathname.startsWith('/video/')) {
    return false
  }
  if (pathname === '/feed-v2' || pathname.startsWith('/feed-v2/')) return false
  if (pathname.startsWith('/messages')) return false
  if (pathname.startsWith('/admin')) return false
  if (pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/onboarding')) {
    return false
  }
  if (pathname.startsWith('/saved') || pathname.startsWith('/settings')) return false
  if (pathname.startsWith('/notifications')) return false
  return true
}

export function DesktopGlobalScrollHeader({
  cityName,
  provinceSlug,
}: {
  cityName?: string
  provinceSlug?: string
} = {}) {
  const pathname = usePathname()
  const { config } = useScrollHeaderContext()
  const [localTenant] = useState(() => readLocalCityTenant())
  const resolvedTenant =
    localTenant ??
    (cityName && provinceSlug
      ? { slug: provinceSlug, displayName: cityName, provinceSlug }
      : null)

  if (!shouldShowGlobalScrollHeader(pathname)) return null

  if (resolvedTenant) {
    return (
      <CityTenantProvider tenant={resolvedTenant}>
        <CityDesktopNewspaperHeader
          cityName={resolvedTenant.displayName}
          tenantSlug={resolvedTenant.slug}
          provinceSlug={resolvedTenant.provinceSlug}
          breakingItems={config.breakingItems}
        />
      </CityTenantProvider>
    )
  }

  return (
    <div className="hidden lg:block">
      <DesktopScrollHeader
        breakingItems={config.breakingItems}
        showBreaking={config.showBreaking}
        subcategories={config.subcategories}
        tabParent={config.tabParent}
      />
    </div>
  )
}
