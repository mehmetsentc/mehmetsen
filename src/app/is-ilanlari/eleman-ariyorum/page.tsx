import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { CityJobClassifiedForm } from '@/components/city/CityJobClassifiedForm'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCityNavPresence } from '@/services/cityNewsService.server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const citySlug = await getCitySlugFromHeaders()
  const cityName = citySlug ? getCityCategoryName(citySlug) : ''
  return {
    title: cityName ? `${cityName} · Eleman arıyorum` : 'Eleman arıyorum',
    description: 'İşveren olarak eleman ilanı bırakın. İnceleme sonrası yayınlanır.',
  }
}

export default async function ElemanAriyorumPage() {
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) redirect(ROUTES.HOME)

  const cityName = getCityCategoryName(citySlug)
  const navPresence = await getCityNavPresence(citySlug)

  return (
    <CityLayoutClient
      tenantSlug={citySlug}
      displayName={cityName}
      provinceSlug={citySlug}
      categories={navPresence.categories}
      hasSpor={navPresence.hasSpor}
    >
      <CityJobClassifiedForm type="employer" citySlug={citySlug} cityName={cityName} />
    </CityLayoutClient>
  )
}
