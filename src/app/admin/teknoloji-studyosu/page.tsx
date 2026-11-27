'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { ListStudio } from '@/components/admin/listStudio/ListStudio'

/** TEKNOLOJİ STÜDYOSU — Top 10 telefon / bilgisayar / TV, ürün ve yapay zekâ tanıtımı, teknoloji haberinden video (NaHaber logosu yok). */
export default function TechStudioPage() {
  return (
    <AdminOsPageShell title="Teknoloji Stüdyosu" subtitle="Top 10 telefon · bilgisayar · TV · yapay zekâ · ürün tanıtımı · teknoloji haberinden video · özellik kartları · NaHaber logosu yok">
      <ListStudio studio="teknoloji" />
    </AdminOsPageShell>
  )
}
