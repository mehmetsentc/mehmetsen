import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { getCityHomeFeedInitialData } from '@/services/cityNewsService.server'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const cityOrigin = `https://${tenant.slug}.nahaber.com`

  return {
    title: `${cityName} Haberleri — ${siteName}`,
    description: `${cityName} son dakika yerel haberler, gündem, etkinlikler ve spor haberleri. ${cityName} şehrinden en güncel haberleri ${siteName}'de takip edin.`,
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

export default async function CityHomePage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const homeFeedData = await getCityHomeFeedInitialData(tenant.provinceSlug)

  return (
    <CityFeedPageClient homeFeedData={homeFeedData} cityName={cityName} />
  )
}
