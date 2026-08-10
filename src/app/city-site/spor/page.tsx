import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { getCitySporFeedInitialData } from '@/services/cityNewsService.server'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} Spor Haberleri`,
    description: `${cityName} spor haberleri, yerel spor gelişmeleri ve maç sonuçları. ${siteName}'de ${cityName} sporunu takip edin.`,
  }
}

export default async function CitySporPage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const homeFeedData = await getCitySporFeedInitialData(tenant.provinceSlug)
  const sectionTitle = `${cityName} Spor Haberleri`

  return (
    <CityFeedPageClient
      homeFeedData={homeFeedData}
      cityName={cityName}
      sectionTitle={sectionTitle}
    />
  )
}
