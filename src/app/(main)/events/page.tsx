import type { Metadata } from 'next'
import { EventList } from '@/components/events/EventList'
import { getUpcomingEventsServer } from '@/services/eventService.server'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'

export const revalidate = 60

const siteUrl = getSiteUrl()

export const metadata: Metadata = {
  title: 'Etkinlikler',
  description:
    'Şehrindeki konser, festival, parti, sergi, tiyatro ve diğer kültürel etkinlikleri keşfet.',
  alternates: { canonical: `${siteUrl}${ROUTES.EVENTS}` },
  robots: { index: true, follow: true },
}

export default async function EventsPage() {
  const initialEvents = await getUpcomingEventsServer(12)
  return <EventList initialEvents={initialEvents} />
}
