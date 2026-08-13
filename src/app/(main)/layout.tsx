import { MainLayoutClient } from '@/components/layout/MainLayoutClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { resolveTenant } from '@/lib/tenant'
import { getCityNavPresence } from '@/services/cityNewsService.server'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const citySlug = await getCitySlugFromHeaders()

  if (citySlug) {
    // City subdomain: full city chrome (ScrollHeader + category pills).
    // CityStaticLayout lacked ScrollHeaderProvider and crashed desktop /kategori/*.
    const tenant = await resolveTenant(citySlug)
    const provinceSlug = tenant?.provinceSlug ?? citySlug
    const cityName = tenant?.displayName ?? citySlug
    const { categories, hasSpor } = await getCityNavPresence(provinceSlug)

    return (
      <CityLayoutClient
        tenantSlug={tenant?.slug ?? citySlug}
        displayName={cityName}
        provinceSlug={provinceSlug}
        categories={categories}
        hasSpor={hasSpor}
      >
        {children}
      </CityLayoutClient>
    )
  }

  return <MainLayoutClient>{children}</MainLayoutClient>
}
