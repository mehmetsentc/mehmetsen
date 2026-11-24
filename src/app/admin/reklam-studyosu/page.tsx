'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { AdStudio } from '@/components/admin/adStudio/AdStudio'

/** REKLAM STÜDYOSU — logosuz firma / ürün / iş ilanı / kampanya reklam videoları. */
export default function AdStudioPage() {
  return (
    <AdminOsPageShell title="Reklam Stüdyosu" subtitle="Firma reklam videoları · 4 profesyonel ses · şablonlar ve yazı stilleri · NaHaber logosu yok">
      <AdStudio />
    </AdminOsPageShell>
  )
}
