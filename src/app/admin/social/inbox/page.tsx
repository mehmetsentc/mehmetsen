'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import { SocialInboxPanel } from '@/components/admin/social/inbox/SocialInboxPanel'

export default function SocialAdminInboxPage() {
  return (
    <AdminOsPageShell title="Sosyal gelen kutusu" subtitle="Instagram ve Facebook özel mesajları, AI cevap taslakları ve hesap bazlı otomatik cevap ayarları">
      <SocialAdminNav />
      <SocialInboxPanel />
    </AdminOsPageShell>
  )
}
