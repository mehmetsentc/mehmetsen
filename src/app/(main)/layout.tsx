import { MainLayoutClient } from '@/components/layout/MainLayoutClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { resolveTenant } from '@/lib/tenant'
import { getCityNavPresence } from '@/services/cityNewsService.server'

export default async function MainLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  // LP7R.2 Article Lift: Next.js parallel-route slot for `@modal`
  // (src/app/(main)/@modal). Optional because parallel-route props are only
  // populated once a matching `@modal` folder exists alongside this layout —
  // this stays a no-op (`undefined`) for any (main) route tree that hasn't
  // added one, so this change is purely additive to every existing route,
  // including feed-v2/Smart Feed.
  modal?: React.ReactNode
}) {
  const citySlug = await getCitySlugFromHeaders()

  if (citySlug) {
    // City subdomain: full city chrome (ScrollHeader + category pills).
    // CityStaticLayout lacked ScrollHeaderProvider and crashed desktop /kategori/*.
    const tenant = await resolveTenant(citySlug)
    const provinceSlug = tenant?.provinceSlug ?? citySlug
    const cityName = tenant?.displayName ?? citySlug
    const { categories, hasSpor } = await getCityNavPresence(provinceSlug)

    return (
      <>
        <CityLayoutClient
          tenantSlug={tenant?.slug ?? citySlug}
          displayName={cityName}
          provinceSlug={provinceSlug}
          categories={categories}
          hasSpor={hasSpor}
        >
          {children}
        </CityLayoutClient>
        {modal}
      </>
    )
  }

  return (
    <>
      <MainLayoutClient>{children}</MainLayoutClient>
      {modal}
    </>
  )
}
