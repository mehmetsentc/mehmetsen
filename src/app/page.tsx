import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ROUTES } from '@/constants/routes'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { getCityHomeFeedInitialData, getCityCategories } from '@/services/cityNewsService.server'
import { getCityCinemaEventsServer } from '@/services/eventService.server'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCitySlugFromHeaders } from '@/lib/cityHost'

// force-dynamic so the host header is available at request time
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  const hostCitySlug = tenant ? null : await getCitySlugFromHeaders()
  const citySlug = tenant?.provinceSlug ?? hostCitySlug
  if (!citySlug) return {}

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
 * the middleware is unavailable (build mismatch, edge config issue, etc.),
 * we detect the city from the Host header and render city content inline.
 * This makes city routing middleware-independent.
 *
 * National site: redirect to /feed (307, not 308, so browsers don't cache it).
 */
export default async function Home() {
  const tenant = await getActiveTenant()
  const hostCitySlug = tenant ? null : await getCitySlugFromHeaders()
  const citySlug = tenant?.provinceSlug ?? hostCitySlug

  if (citySlug) {
    const slug = tenant?.slug ?? citySlug
    const displayName = getCityCategoryName(citySlug)
    const [homeFeedData, categories, cinemaEvents] = await Promise.all([
      getCityHomeFeedInitialData(citySlug),
      getCityCategories(citySlug),
      getCityCinemaEventsServer(citySlug),
    ])
    return (
      <CityLayoutClient
        tenantSlug={slug}
        displayName={displayName}
        provinceSlug={citySlug}
        categories={categories}
      >
        <CityFeedPageClient
          homeFeedData={homeFeedData}
          cityName={displayName}
          cinemaEvents={cinemaEvents}
        />
      </CityLayoutClient>
    )
  }

  redirect(ROUTES.FEED)
}
