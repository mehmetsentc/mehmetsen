import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { getCityHomeFeedInitialData } from '@/services/cityNewsService.server'
import { getCityCinemaEventsServer } from '@/services/eventService.server'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
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
 * National + city homepage at `/`, under `(main)` so soft-nav into
 * `/haber/[slug]` stays inside the same layout that owns `@modal` Article
 * Lift. Living at `src/app/page.tsx` (outside `(main)`) caused soft clicks
 * from anasayfa to render the global 404 while hard refresh still worked.
 *
 * City chrome (`CityLayoutClient`) and national chrome (`MainLayoutClient`)
 * come from `(main)/layout.tsx` — do not wrap them again here.
 */
export default async function Home() {
  const tenant = await getActiveTenant()
  const hostCitySlug = tenant ? null : await getCitySlugFromHeaders()
  const citySlug = tenant?.provinceSlug ?? hostCitySlug

  if (citySlug) {
    const displayName = getCityCategoryName(citySlug)
    const [homeFeedData, cinemaEvents] = await Promise.all([
      getCityHomeFeedInitialData(citySlug),
      getCityCinemaEventsServer(citySlug),
    ])
    return (
      <CityFeedPageClient
        homeFeedData={homeFeedData}
        cityName={displayName}
        cinemaEvents={cinemaEvents}
      />
    )
  }

  return <NationalHomePage />
}
