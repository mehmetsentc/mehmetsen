import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { CityJobDetail } from '@/components/city/CityJobDetail'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { getCityNavPresence } from '@/services/cityNewsService.server'
import { loadCityJobDetail } from '@/services/jobDetailPage.server'
import { buildJobPostingJsonLd, cityServicesSchemaLive, jsonLdString } from '@/lib/seo/cityServicesJsonLd'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) return { title: 'İş ilanı' }
  const detail = await loadCityJobDetail(citySlug, id)
  if (!detail) return { title: 'İş ilanı' }
  return {
    title: detail.employer ? `${detail.title} · ${detail.employer}` : detail.title,
    description: `${detail.cityName} iş ilanı: ${detail.title}.`,
  }
}

/**
 * Public /is-ilanlari/[id] stub so the App Router manifest includes the detail
 * route. City hosts are rewritten to /city-site/is-ilanlari/[id].
 */
export default async function IsIlaniDetailPage({ params }: Props) {
  const { id } = await params
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) redirect(ROUTES.HOME)

  const detail = await loadCityJobDetail(citySlug, id)
  if (!detail) notFound()

  const cityName = getCityCategoryName(citySlug)
  const navPresence = await getCityNavPresence(citySlug)
  // SEO-16: city hosts render this root route (not /city-site), so the CITY-SERVICES-1
  // structured data must live here too — it never reached Google after 25 Oct.
  const jsonLd =
    cityServicesSchemaLive() && detail.schema
      ? buildJobPostingJsonLd({
          id: detail.id,
          title: detail.title,
          employer: detail.employer,
          summary: detail.summary,
          place: detail.place,
          cityName: detail.cityName,
          ...detail.schema,
        })
      : null

  return (
    <CityLayoutClient
      tenantSlug={citySlug}
      displayName={cityName}
      provinceSlug={citySlug}
      categories={navPresence.categories}
      hasSpor={navPresence.hasSpor}
    >
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      ) : null}
      <CityJobDetail detail={detail} />
    </CityLayoutClient>
  )
}
