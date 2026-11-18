'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import { StoryStudioPro } from '@/components/admin/social/StoryStudioPro'

export default function SocialVideoStudioPage() {
  return (
    <AdminOsPageShell title="Video Stüdyosu" subtitle="Konudan dikey / yatay, 1–10 dakikalık anlatım videosu">
      <SocialAdminNav />
      <StoryStudioPro />
    </AdminOsPageShell>
  )
}
