import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
import { getActiveTenant } from '@/lib/tenantContext'
import { resolveCityCategoryRoute } from '@/lib/cityCategoryRoute'
import { buildCityCategoryMetadata } from '@/lib/seo/cityCategoryMetadata'
import { getCityCategoryFeedInitialData } from '@/services/cityNewsService.server'
import { CityNewspaperCategoryPage } from '@/components/city/CityNewspaperCategoryPage'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return {}
  return buildCityCategoryMetadata(tenant.slug, id)
}

export default async function CityCategoryPage({ params }: PageProps) {
  const { id } = await params
  const tenant = await getActiveTenant()
  if (!tenant) return null

  const resolved = resolveCityCategoryRoute(id)
  if (!resolved) notFound()

  const cityName = getCityCategoryName(tenant.provinceSlug)
  const homeFeedData = await getCityCategoryFeedInitialData(
    tenant.provinceSlug,
    resolved.categoryId
  )
  const sectionTitle = `${cityName} ${resolved.label} Haberleri`

  return (
    <CityNewspaperCategoryPage
      homeFeedData={homeFeedData}
      cityName={cityName}
      sectionTitle={sectionTitle}
    />
  )
}
