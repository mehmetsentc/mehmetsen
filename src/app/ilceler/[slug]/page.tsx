import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import {
  DISTRICT_DISPLAY_NAMES,
  getCityCategoryName,
  getDistrictsForProvince,
} from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { buildCityPageMetadata } from '@/lib/seo/cityPageMetadata'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'
import { getCityDistrictFeedInitialData, getCityNavPresence } from '@/services/cityNewsService.server'
import { getDutyPharmaciesServer } from '@/services/dutyPharmacyService.server'
import { isDutyPharmacyCity } from '@/lib/dutyPharmacies/constants'
import { filterDutyPharmacyGroups } from '@/lib/dutyPharmacies/officialDistrict'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) return {}

  const districtName = DISTRICT_DISPLAY_NAMES[slug]
  if (!districtName) return {}

  const cityName = getCityCategoryName(citySlug)
  const siteName = process.env.NEXT_PUBLIC_APP_NAME?.trim() || 'NaHaber'

  const title = `${districtName} Haberleri — ${cityName}`
  const description = `${districtName} ilçesinden yerel haberler. ${cityName} ${districtName} haberleri ${siteName}'de.`

  // Self-canonical only when the district really belongs to this province.
  const district = getDistrictsForProvince(citySlug).find((d) => d.slug === slug)
  const cityMetadata = district
    ? buildCityPageMetadata({
        citySlug,
        segments: ['ilceler', district.slug],
        title,
        description,
      })
    : null

  return cityMetadata ?? { title, description }
}

export default async function IlcePage({ params }: PageProps) {
  const { slug } = await params
  const citySlug = await getCitySlugFromHeaders()

  if (!citySlug) {
    redirect(ROUTES.LOCAL)
  }

  const districts = getDistrictsForProvince(citySlug)
  const district = districts.find((d) => d.slug === slug)
  if (!district) notFound()

  const cityName = getCityCategoryName(citySlug)
  const [homeFeedData, navPresence, dutySnapshot] = await Promise.all([
    getCityDistrictFeedInitialData(citySlug, slug),
    getCityNavPresence(citySlug),
    isDutyPharmacyCity(citySlug)
      ? getDutyPharmaciesServer(citySlug)
      : Promise.resolve(null),
  ])
  const dutyPharmacyGroups = dutySnapshot
    ? filterDutyPharmacyGroups(dutySnapshot.groups, slug, citySlug)
    : []

  return (
    <CityLayoutClient
      tenantSlug={citySlug}
      displayName={cityName}
      provinceSlug={citySlug}
      categories={navPresence.categories}
      hasSpor={navPresence.hasSpor}
    >
      <CityFeedPageClient
        homeFeedData={homeFeedData}
        cityName={cityName}
        districtName={district.name}
        districtSlug={slug}
        dutyPharmacyGroups={dutyPharmacyGroups}
      />
    </CityLayoutClient>
  )
}
