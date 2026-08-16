import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityCategoryName, getDistrictsForProvince } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { DUTY_PHARMACY_CITY_SLUG } from '@/lib/dutyPharmacies/constants'
import { CityDutyPharmaciesClient } from '@/components/city/CityDutyPharmaciesClient'
import { getDutyPharmaciesServer } from '@/services/dutyPharmacyService.server'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ district: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { district: districtSlug } = await params
  const tenant = await getActiveTenant()
  if (tenant?.provinceSlug !== DUTY_PHARMACY_CITY_SLUG) return {}

  const district = getDistrictsForProvince(tenant.provinceSlug).find(
    (d) => d.slug === districtSlug
  )
  if (!district) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${district.name} Nöbetçi Eczaneler — ${cityName}`,
    description: `${district.name} günlük nöbetçi eczane listesi. Adres, telefon ve nöbet saatleri. Kaynak: Çanakkale Eczacı Odası. ${siteName}`,
  }
}

export default async function CityDutyPharmaciesDistrictPage({ params }: PageProps) {
  const { district: districtSlug } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return null
  if (tenant.provinceSlug !== DUTY_PHARMACY_CITY_SLUG) {
    redirect(ROUTES.HOME)
  }

  const district = getDistrictsForProvince(tenant.provinceSlug).find(
    (d) => d.slug === districtSlug
  )
  if (!district) notFound()

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const snapshot = await getDutyPharmaciesServer(tenant.provinceSlug)

  return (
    <CityDutyPharmaciesClient
      cityName={cityName}
      snapshot={snapshot}
      districtSlug={district.slug}
      districtName={district.name}
    />
  )
}
