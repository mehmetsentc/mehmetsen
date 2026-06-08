import type { Metadata } from 'next'
import { EventList } from '@/components/events/EventList'

export const metadata: Metadata = {
  title: 'Etkinlikler',
  description:
    'Şehrindeki konser, festival, parti, sergi, tiyatro ve diğer kültürel etkinlikleri keşfet.',
}

export default function EventsPage() {
  return <EventList />
}
