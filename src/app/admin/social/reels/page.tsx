'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { ReelsStudioPanel } from '@/components/admin/social/ReelsStudioPanel'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'

export default function SocialReelsPage() {
  return (
    <AdminOsPageShell title="Reels" subtitle="Haberden otomatik dikey video (önizleme)">
      <SocialAdminNav />
      <ReelsStudioPanel />
    </AdminOsPageShell>
  )
}
