import { MainLayoutClient } from '@/components/layout/MainLayoutClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { ArticleLiftOriginCapture } from '@/components/articleLift/ArticleLiftOriginCapture'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { resolveTenant } from '@/lib/tenant'
import { getCityNavPresence } from '@/services/cityNewsService.server'

export default async function MainLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  // LP7R.2 Article Lift: Next.js parallel-route slot for `@modal`
  // (src/app/(main)/@modal). Typed as required, not optional — Next's own
  // generated route types (.next/types/app/(main)/layout.ts) require every
  // parallel-route slot key to be present, since Next.js always provides a
  // value for it (falling back to @modal/default.tsx's `null` on every
  // route that isn't the intercepted article route). It is still a no-op
  // on every existing route, including feed-v2/Smart Feed — this change is
  // purely additive.
  modal: React.ReactNode
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
        <ArticleLiftOriginCapture />
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
      <ArticleLiftOriginCapture />
      <MainLayoutClient>{children}</MainLayoutClient>
      {modal}
    </>
  )
}
