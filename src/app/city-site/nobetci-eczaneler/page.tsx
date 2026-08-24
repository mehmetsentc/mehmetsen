import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import {
  dutyPharmacySourceForCity,
  isDutyPharmacyCity,
} from '@/lib/dutyPharmacies/constants'
import { CityDutyPharmaciesClient } from '@/components/city/CityDutyPharmaciesClient'
import { getDutyPharmaciesServer } from '@/services/dutyPharmacyService.server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (!isDutyPharmacyCity(tenant?.provinceSlug)) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'
  const source = dutyPharmacySourceForCity(tenant.provinceSlug)

  return {
    title: `${cityName} Nöbetçi Eczaneler`,
    description: `${cityName} günlük nöbetçi eczane listesi. İlçe ilçe adres, telefon ve nöbet saatleri. Kaynak: ${source?.label ?? 'İl Eczacı Odası'}. ${siteName}`,
  }
}

export default async function CityDutyPharmaciesPage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null
  if (!isDutyPharmacyCity(tenant.provinceSlug)) {
    redirect(ROUTES.HOME)
  }

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const snapshot = await getDutyPharmaciesServer(tenant.provinceSlug)

  return <CityDutyPharmaciesClient cityName={cityName} snapshot={snapshot} />
}
