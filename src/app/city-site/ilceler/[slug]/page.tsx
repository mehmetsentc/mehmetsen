import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getActiveTenant } from '@/lib/tenantContext'
import {
  getCityCategoryName,
  getDistrictsForProvince,
  DISTRICT_DISPLAY_NAMES,
} from '@/constants/cities'
import { getCityNewsByDistrict, getCityCategories } from '@/services/cityNewsService.server'
import { CityFeedClient } from '@/components/city/CityFeedClient'

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

  const [items, categories] = await Promise.all([
    getCityNewsByDistrict(tenant.provinceSlug, slug, 30),
    getCityCategories(tenant.provinceSlug),
  ])

  return (
    <CityFeedClient
      citySlug={tenant.provinceSlug}
      initialItems={items}
      categories={categories}
    />
  )
}
