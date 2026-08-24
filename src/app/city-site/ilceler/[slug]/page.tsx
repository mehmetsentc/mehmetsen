import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getActiveTenant } from '@/lib/tenantContext'
import {
  getCityCategoryName,
  getDistrictsForProvince,
  DISTRICT_DISPLAY_NAMES,
} from '@/constants/cities'
import { getCityDistrictFeedInitialData } from '@/services/cityNewsService.server'
import { getDutyPharmaciesServer } from '@/services/dutyPharmacyService.server'
import { isDutyPharmacyCity } from '@/lib/dutyPharmacies/constants'
import { filterDutyPharmacyGroups } from '@/lib/dutyPharmacies/officialDistrict'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return {}

  const districtName = DISTRICT_DISPLAY_NAMES[slug]
  if (!districtName) return {}

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  return {
    title: `${districtName} Haberleri — ${cityName} | ${siteName}`,
    description: `${districtName} ilçesinden yerel haberler. ${cityName} ${districtName} haberleri ${siteName}'de.`,
  }
}

export default async function CityDistrictPage({ params }: PageProps) {
  const { slug } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const districts = getDistrictsForProvince(tenant.provinceSlug)
  const district = districts.find((d) => d.slug === slug)
  if (!district) notFound()

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const [homeFeedData, dutySnapshot] = await Promise.all([
    getCityDistrictFeedInitialData(tenant.provinceSlug, slug),
    isDutyPharmacyCity(tenant.provinceSlug)
      ? getDutyPharmaciesServer(tenant.provinceSlug)
      : Promise.resolve(null),
  ])
  const dutyPharmacyGroups = dutySnapshot
    ? filterDutyPharmacyGroups(dutySnapshot.groups, slug, tenant.provinceSlug)
    : []

  return (
    <CityFeedPageClient
      homeFeedData={homeFeedData}
      cityName={cityName}
      districtName={district.name}
      districtSlug={slug}
      dutyPharmacyGroups={dutyPharmacyGroups}
    />
  )
}
