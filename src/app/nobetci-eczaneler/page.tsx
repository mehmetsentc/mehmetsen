import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
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

export async function generateMetadata(): Promise<Metadata> {
  const citySlug = await getCitySlugFromHeaders()
  if (!isDutyPharmacyCity(citySlug)) {
    return { title: 'Nöbetçi Eczaneler' }
  }

  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const source = dutyPharmacySourceForCity(citySlug)

  return {
    title: `${cityName} Nöbetçi Eczaneler`,
    description: `${cityName} günlük nöbetçi eczane listesi. İlçe ilçe adres, telefon ve nöbet saatleri. Kaynak: ${source?.label ?? 'İl Eczacı Odası'}. ${siteName}`,
  }
}

/**
 * Public /nobetci-eczaneler stub — mirrors /is-ilanlari.
 * City hosts resolve via headers; Çanakkale + Antalya publish this list.
 */
export default async function NobetciEczanelerPage() {
  const citySlug = await getCitySlugFromHeaders()

  if (!isDutyPharmacyCity(citySlug)) {
    redirect(ROUTES.HOME)
  }

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
      <CityDutyPharmaciesClient cityName={cityName} snapshot={snapshot} />
    </CityLayoutClient>
  )
}
