import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { CityEventsClient } from '@/components/city/CityEventsClient'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} Etkinlikleri`,
    description: `${cityName} şehrindeki etkinlikler, konserler, tiyatrolar ve festivaller. ${siteName}'de ${cityName} etkinliklerini keşfedin.`,
  }
}

export default async function CityEventsPage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const cityName = getCityCategoryName(tenant.provinceSlug)

  return (
    <CityEventsClient
      citySlug={tenant.provinceSlug}
      cityName={cityName}
    />
  )
}
