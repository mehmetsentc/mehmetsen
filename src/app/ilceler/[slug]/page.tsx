import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import {
  DISTRICT_DISPLAY_NAMES,
  getCityCategoryName,
  getDistrictsForProvince,
} from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { CityFeedPageClient } from '@/components/city/CityFeedPageClient'
import { getCityDistrictFeedInitialData, getCityNavPresence } from '@/services/cityNewsService.server'

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

  return {
    title: `${districtName} Haberleri — ${cityName} | ${siteName}`,
    description: `${districtName} ilçesinden yerel haberler. ${cityName} ${districtName} haberleri ${siteName}'de.`,
  }
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
  const [homeFeedData, navPresence] = await Promise.all([
    getCityDistrictFeedInitialData(citySlug, slug),
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
      <CityFeedPageClient
        homeFeedData={homeFeedData}
        cityName={cityName}
        districtName={district.name}
      />
    </CityLayoutClient>
  )
}
