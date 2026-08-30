import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getActiveTenant } from '@/lib/tenantContext'
import { getCityEventById } from '@/services/eventService.server'
import { CityEventDetailView } from '@/components/city/CityEventDetailView'

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

  return <CityEventDetailView event={event} />
}
