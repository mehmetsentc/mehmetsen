import { MainLayoutClient } from '@/components/layout/MainLayoutClient'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { resolveTenant } from '@/lib/tenant'
import { CityStaticLayout } from '@/components/city/CityStaticLayout'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const citySlug = await getCitySlugFromHeaders()

  if (citySlug) {
    // (main) sayfaları city subdomain'de CityStaticLayout ile sarmalanır:
    // CityNavbar (header) + CityFooter sağlar, ulusal navbar hiç eklenmez.
    const tenant = await resolveTenant(citySlug)
    const cityName = tenant?.displayName ?? citySlug
    const provinceSlug = tenant?.provinceSlug ?? citySlug

    return (
      <CityStaticLayout cityName={cityName} provinceSlug={provinceSlug}>
        {children}
      </CityStaticLayout>
    )
  }

  return <MainLayoutClient>{children}</MainLayoutClient>
}
