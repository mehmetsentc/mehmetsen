'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { ListStudio } from '@/components/admin/listStudio/ListStudio'

/** ETKİNLİK VİDEO STÜDYOSU — Etkinlik Masası'ndan seçilen etkinliklerden tek dinamik video (hesap filigranı, NaHaber logosu yok). */
export default function EventStudioPage() {
  return (
    <AdminOsPageShell title="Etkinlik Video Stüdyosu" subtitle="Seçilen etkinliklerden tek video · konser videosu önce, anlatım sonra · hesap filigranı · NaHaber logosu yok">
      <ListStudio studio="etkinlik" />
    </AdminOsPageShell>
  )
}
