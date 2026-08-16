import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { DUTY_PHARMACY_CITY_SLUG } from '@/lib/dutyPharmacies/constants'
import { CityDutyPharmaciesClient } from '@/components/city/CityDutyPharmaciesClient'
import { getDutyPharmaciesServer } from '@/services/dutyPharmacyService.server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  const tenant = await getActiveTenant()
  if (tenant?.provinceSlug !== DUTY_PHARMACY_CITY_SLUG) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${cityName} Nöbetçi Eczaneler`,
    description: `${cityName} günlük nöbetçi eczane listesi. İlçe ilçe adres, telefon ve nöbet saatleri. Kaynak: Çanakkale Eczacı Odası. ${siteName}`,
  }
}

export default async function CityDutyPharmaciesPage() {
  const tenant = await getActiveTenant()
  if (!tenant) return null
  if (tenant.provinceSlug !== DUTY_PHARMACY_CITY_SLUG) {
    redirect(ROUTES.HOME)
  }

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const snapshot = await getDutyPharmaciesServer(tenant.provinceSlug)

  return <CityDutyPharmaciesClient cityName={cityName} snapshot={snapshot} />
}
