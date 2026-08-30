import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { getCityCategoryName } from '@/constants/cities'
import { ROUTES } from '@/constants/routes'
import { getCitySlugFromHeaders } from '@/lib/cityHost'
import { CityLayoutClient } from '@/components/city/CityLayoutClient'
import { getCityNavPresence } from '@/services/cityNewsService.server'
import { getCityEventById } from '@/services/eventService.server'
import { CityEventDetailView } from '@/components/city/CityEventDetailView'

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

  return (
    <CityLayoutClient
      tenantSlug={citySlug}
      displayName={cityName}
      provinceSlug={citySlug}
      categories={navPresence.categories}
      hasSpor={navPresence.hasSpor}
    >
      <CityEventDetailView event={event} />
    </CityLayoutClient>
  )
}
