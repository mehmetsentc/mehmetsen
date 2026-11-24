'use client'

import { useEffect, useState } from 'react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { EventDesk } from '@/components/admin/events/EventDesk'
import { LegacyEventsAdmin } from '@/components/admin/events/LegacyEventsAdmin'

/** EVENT-DESK-1: Etkinlik Masası; eski liste ve ekleme formu `?eski=1`. */
export default function AdminEventsPage() {
  const [legacy, setLegacy] = useState<boolean | null>(null)
  useEffect(() => {
    setLegacy(new URLSearchParams(window.location.search).get('eski') === '1')
  }, [])
  if (legacy === null) return null
  if (legacy) return <LegacyEventsAdmin />
  return (
    <AdminOsPageShell title="Etkinlik Masası" subtitle="Yaklaşan etkinlikler · kaynaklar birleştirildi · tek tıkla AI etkinlik haberi">
      <EventDesk />
    </AdminOsPageShell>
  )
}
