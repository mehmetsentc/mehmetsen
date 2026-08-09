import { MainLayoutClient } from '@/components/layout/MainLayoutClient'
import { getCitySlugFromHeaders } from '@/lib/cityHost'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const citySlug = await getCitySlugFromHeaders()

  // City subdomains use CityLayoutClient — never stack national Navbar/CategoryNav.
  if (citySlug) {
    return <>{children}</>
  }

  return <MainLayoutClient>{children}</MainLayoutClient>
}
