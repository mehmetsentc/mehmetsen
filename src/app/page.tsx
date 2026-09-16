import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { getCityHomeFeedInitialData, getCityNavPresence } from '@/services/cityNewsService.server'
import { getCityCinemaEventsServer } from '@/services/eventService.server'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { MainLayoutClient } from '@/components/layout/MainLayoutClient'
import { ArticleLiftOriginCapture } from '@/components/articleLift/ArticleLiftOriginCapture'
import { NationalHomePage, nationalHomeMetadata } from '@/components/home/NationalHomePage'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  const hostCitySlug = tenant ? null : await getCitySlugFromHeaders()
  const citySlug = tenant?.provinceSlug ?? hostCitySlug
  if (!citySlug) return nationalHomeMetadata()

  const slug = tenant?.slug ?? citySlug
  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const cityOrigin = `https://${slug}.nahaber.com`

  return {
    title: `${cityName} Haberleri — ${siteName}`,
    description: `${cityName} son dakika yerel haberler, gündem, etkinlikler ve spor haberleri.`,
    alternates: {
      canonical: cityOrigin,
    },
    openGraph: {
      title: `${cityName} Haberleri — ${siteName}`,
      description: `${cityName} şehrinden son dakika yerel haberler ve güncel gelişmeler.`,
      url: cityOrigin,
      type: 'website',
      locale: 'tr_TR',
      siteName,
    },
  }
}

/**
 * Root `/` handler.
 *
 * City subdomains: middleware normally rewrites `/` → `/city-site`, but if
 * the middleware is unavailable we detect the city from the Host header.
 *
 * National site: Anasayfa lives at `/` (eski `/feed` buraya yönlenir).
 */
export default async function Home() {
  const tenant = await getActiveTenant()
  const hostCitySlug = tenant ? null : await getCitySlugFromHeaders()
  const citySlug = tenant?.provinceSlug ?? hostCitySlug

  if (citySlug) {
    const slug = tenant?.slug ?? citySlug
    const displayName = getCityCategoryName(citySlug)
    const [homeFeedData, navPresence, cinemaEvents] = await Promise.all([
      getCityHomeFeedInitialData(citySlug),
      getCityNavPresence(citySlug),
      getCityCinemaEventsServer(citySlug),
    ])
    return (
      <CityLayoutClient
        tenantSlug={slug}
        displayName={displayName}
        provinceSlug={citySlug}
        categories={navPresence.categories}
        hasSpor={navPresence.hasSpor}
      >
        <CityFeedPageClient
          homeFeedData={homeFeedData}
          cityName={displayName}
          cinemaEvents={cinemaEvents}
        />
      </CityLayoutClient>
    )
  }

  return (
    <>
      <ArticleLiftOriginCapture />
      <MainLayoutClient>
        <NationalHomePage />
      </MainLayoutClient>
    </>
  )
}
