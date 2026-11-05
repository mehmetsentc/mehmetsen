'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import { SocialCommentsModeration } from '@/components/admin/social/SocialCommentsModeration'

export default function SocialAdminCommentsPage() {
  return (
    <AdminOsPageShell title="Sosyal medya yorumları" subtitle="Instagram, Facebook, Threads ve YouTube gönderilerine gelen yorumlar — onaylananlar NaHaber'de haberin altında görünür">
      <SocialAdminNav />
      <SocialCommentsModeration />
    </AdminOsPageShell>
  )
}
