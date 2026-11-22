'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { AgentPanel } from '@/components/admin/social/AgentPanel'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'

export default function SocialAgentPage() {
  return (
    <AdminOsPageShell title="Vekil Editör" subtitle="Senin gibi seçen yapay zekâ — şu an yalnızca gölge modda, paylaşım yapmaz">
      <SocialAdminNav />
      <AgentPanel />
    </AdminOsPageShell>
  )
}
