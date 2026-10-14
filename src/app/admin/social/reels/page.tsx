'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { ReelsStudio } from '@/components/admin/social/ReelsStudio'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'

export default function SocialReelsPage() {
  return (
    <AdminOsPageShell title="Reels" subtitle="Haberden dikey video — stüdyo">
      <SocialAdminNav />
      <ReelsStudio />
    </AdminOsPageShell>
  )
}
