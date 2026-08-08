import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { getCityNews } from '@/services/cityNewsService.server'
import { CityFeedClient } from '@/components/city/CityFeedClient'
import { getSiteUrl } from '@/lib/seo'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const siteUrl = getSiteUrl()

  return {
    title: `${cityName} Haberleri — ${siteName}`,
    description: `${cityName} son dakika yerel haberler, gündem, etkinlikler ve spor haberleri. ${cityName} şehrinden en güncel haberleri ${siteName}'de takip edin.`,
    openGraph: {
      title: `${cityName} Haberleri — ${siteName}`,
      description: `${cityName} şehrinden son dakika yerel haberler ve güncel gelişmeler.`,
      url: siteUrl,
      type: 'website',
      locale: 'tr_TR',
      siteName,
    },
  }
}

export default async function CityHomePage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const items = await getCityNews(tenant.provinceSlug, 30)

  return (
    <CityFeedClient
      citySlug={tenant.provinceSlug}
      initialItems={items}
    />
  )
}
