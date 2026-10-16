import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityEventById } from '@/services/eventService.server'
import { CityEventDetailView } from '@/components/city/CityEventDetailView'
import { buildCityEventJsonLd, cityServicesSchemaLive, jsonLdString } from '@/lib/seo/cityServicesJsonLd'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const tenant = await getActiveTenant()
  const event = await getCityEventById(id, tenant?.provinceSlug)
  if (!event) return {}
  return {
    title: event.title,
    description: event.description?.slice(0, 160),
  }
}

export default async function CityEventDetailPage({ params }: Props) {
  const { id } = await params
  const tenant = await getActiveTenant()
  if (!tenant) notFound()

  const event = await getCityEventById(id, tenant.provinceSlug)
  if (!event) notFound()

  const jsonLd = cityServicesSchemaLive() ? buildCityEventJsonLd(event) : null

  return (
    <>
      {jsonLd ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      ) : null}
      <CityEventDetailView event={event} />
    </>
  )
}
