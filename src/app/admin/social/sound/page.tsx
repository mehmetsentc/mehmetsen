'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CityBrandingPanel } from '@/components/admin/social/CityBrandingPanel'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'

export default function SocialSoundPage() {
  return (
    <AdminOsPageShell title="İl Ses ve Renk" subtitle="Her ilin sunucusu, rengi ve müziği; kategori kuralları">
      <SocialAdminNav />
      <CityBrandingPanel />
    </AdminOsPageShell>
  )
}
