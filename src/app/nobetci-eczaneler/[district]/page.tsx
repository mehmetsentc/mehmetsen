import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getCityCategoryName, getDistrictsForProvince } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import {
  dutyPharmacySourceForCity,
  isDutyPharmacyCity,
} from '@/lib/dutyPharmacies/constants'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { CityDutyPharmaciesClient } from '@/components/city/CityDutyPharmaciesClient'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getDutyPharmaciesServer } from '@/services/dutyPharmacyService.server'
import { getCityNavPresence } from '@/services/cityNewsService.server'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ district: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { district: districtSlug } = await params
  const citySlug = await getCitySlugFromHeaders()
  if (!isDutyPharmacyCity(citySlug)) {
    return { title: 'Nöbetçi Eczaneler' }
  }

  const district = getDistrictsForProvince(citySlug).find((d) => d.slug === districtSlug)
  if (!district) return {}

  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const source = dutyPharmacySourceForCity(citySlug)

  return {
    title: `${district.name} Nöbetçi Eczaneler — ${cityName}`,
    description: `${district.name} günlük nöbetçi eczane listesi. Adres, telefon ve nöbet saatleri. Kaynak: ${source?.label ?? 'İl Eczacı Odası'}. ${siteName}`,
  }
}

export default async function NobetciEczanelerDistrictPage({ params }: PageProps) {
  const { district: districtSlug } = await params
  const citySlug = await getCitySlugFromHeaders()

  if (!isDutyPharmacyCity(citySlug)) {
    redirect(ROUTES.HOME)
  }

  const district = getDistrictsForProvince(citySlug).find((d) => d.slug === districtSlug)
  if (!district) notFound()

  const cityName = getCityCategoryName(citySlug)
  const [snapshot, navPresence] = await Promise.all([
    getDutyPharmaciesServer(citySlug),
    getCityNavPresence(citySlug),
  ])

  return (
    <CityLayoutClient
      tenantSlug={citySlug}
      displayName={cityName}
      provinceSlug={citySlug}
      categories={navPresence.categories}
      hasSpor={navPresence.hasSpor}
    >
      <CityDutyPharmaciesClient
        cityName={cityName}
        snapshot={snapshot}
        districtSlug={district.slug}
        districtName={district.name}
      />
    </CityLayoutClient>
  )
}
