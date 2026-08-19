'use client'

import { AdminOsEmptyState, AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { CrawlerSubnav } from '@/components/admin/crawler/CrawlerSubnav'

export default function CrawlerStubPage({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <AdminOsPageShell title={title} subtitle="Phase 0 iskelet — veri modeli hazır, bu ekran Phase 1.">
      <CrawlerSubnav />
      <AdminOsEmptyState title={title} description={description} />
    </AdminOsPageShell>
  )
}
