import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName, getDistrictsForProvince } from '@/constants/cities'
import { CityDistrictsClient } from '@/components/city/CityDistrictsClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} İlçeleri`,
    description: `${cityName} ilçelerinden yerel haberler. ${siteName}'de ${cityName} ilçe haberleri.`,
  }
}

export default async function CityDistrictsPage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const districts = getDistrictsForProvince(tenant.provinceSlug)

  return (
    <CityDistrictsClient
      citySlug={tenant.provinceSlug}
      cityName={cityName}
      districts={districts}
    />
  )
}
