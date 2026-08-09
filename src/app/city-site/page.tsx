import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { getCityNews, getCityCategories } from '@/services/cityNewsService.server'
import { CityFeedClient } from '@/components/city/CityFeedClient'
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

  const [items, categories] = await Promise.all([
    getCityNews(tenant.provinceSlug, 30),
    getCityCategories(tenant.provinceSlug),
  ])

  return (
    <CityFeedClient
      citySlug={tenant.provinceSlug}
      initialItems={items}
      categories={categories}
    />
  )
}
