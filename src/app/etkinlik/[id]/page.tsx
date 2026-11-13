import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCityNavPresence } from '@/services/cityNewsService.server'
import { getCityEventById } from '@/services/eventService.server'
import { CityEventDetailView } from '@/components/city/CityEventDetailView'
import { buildCityEventJsonLd, cityServicesSchemaLive, jsonLdString } from '@/lib/seo/cityServicesJsonLd'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params
  const citySlug = await getCitySlugFromHeaders()
  if (!citySlug) return {}

  const event = await getCityEventById(id, citySlug)
  if (!event) return {}

  return {
    title: event.title,
    description: event.description?.slice(0, 160),
  }
}

export default async function EtkinlikDetailPage({ params }: PageProps) {
  const { id } = await params
  const citySlug = await getCitySlugFromHeaders()

  if (!citySlug) {
    redirect(ROUTES.EVENTS)
  }

  const [event, navPresence] = await Promise.all([
    getCityEventById(id, citySlug),
    getCityNavPresence(citySlug),
  ])

  if (!event) {
    notFound()
  }

  const cityName = getCityCategoryName(citySlug)
  // SEO-16: city hosts render this root route (not /city-site), so the CITY-SERVICES-1
  // structured data must live here too — it never reached Google after 25 Oct.
  const jsonLd = cityServicesSchemaLive() ? buildCityEventJsonLd(event) : null

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
      <CityEventDetailView event={event} />
    </CityLayoutClient>
  )
}
