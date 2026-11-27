'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { ListStudio } from '@/components/admin/listStudio/ListStudio'

/** LİSTE STÜDYOSU — Top 5 / 10 / 20 müzik, film, dizi ve DJ tanıtım videoları (NaHaber logosu yok). */
export default function ListStudioPage() {
  return (
    <AdminOsPageShell title="Liste Stüdyosu" subtitle="Top 5 · 10 · 20 müzik, film, dizi ve DJ listeleri · canlı sunucu sesi · sıra kartları, geçişler ve efektler · NaHaber logosu yok">
      <ListStudio />
    </AdminOsPageShell>
  )
}
