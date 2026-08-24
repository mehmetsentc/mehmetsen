import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { getCityHomeFeedInitialData } from '@/services/cityNewsService.server'
import { getCityCinemaEventsServer } from '@/services/eventService.server'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const cityOrigin = `https://${tenant.slug}.nahaber.com`
  const mainOrigin = 'https://www.nahaber.com'
  const ogImage = `${mainOrigin}/brand/og-default.png`

  return {
    title: `${cityName} Haberleri — ${siteName}`,
    description: `${cityName} son dakika yerel haberler, gündem, etkinlikler ve spor haberleri. ${cityName} şehrinden en güncel haberleri ${siteName}'de takip edin.`,
    alternates: {
      canonical: cityOrigin,
      languages: {
        'tr-TR': cityOrigin,
        tr: cityOrigin,
        'x-default': mainOrigin,
      },
    },
    openGraph: {
      title: `${cityName} Haberleri — ${siteName}`,
      description: `${cityName} şehrinden son dakika yerel haberler ve güncel gelişmeler.`,
      url: cityOrigin,
      type: 'website',
      locale: 'tr_TR',
      siteName,
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${cityName} NaHaber` }],
    },
    twitter: {
      card: 'summary_large_image',
      site: '@nahabercom',
      title: `${cityName} Haberleri — ${siteName}`,
      description: `${cityName} şehrinden son dakika yerel haberler ve güncel gelişmeler.`,
      images: [ogImage],
    },
  }
}

export default async function CityHomePage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const [homeFeedData, cinemaEvents] = await Promise.all([
    getCityHomeFeedInitialData(tenant.provinceSlug),
    getCityCinemaEventsServer(tenant.provinceSlug),
  ])

  return (
    <CityFeedPageClient
      homeFeedData={homeFeedData}
      cityName={cityName}
      cinemaEvents={cinemaEvents}
    />
  )
}
