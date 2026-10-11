'use client'

import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import { UncertainPublishPanel } from '@/components/admin/social/UncertainPublishPanel'
import { ShareComposer } from '@/components/social/ShareComposer'
import { ShareHistory } from '@/components/social/ShareHistory'

export default function SocialAdminSharesPage() {
  return (
    <AdminOsPageShell title="Paylaşımlar" subtitle="Hedef hesabı açıkça seçilen manuel yayın, yayın kayıtları ve belirsiz sonuçlar">
      <SocialAdminNav />
      <section className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 sm:p-4">
        <h2 className="mb-3 text-base font-bold">Hesapta yayımla</h2>
        <ShareComposer />
      </section>
      <UncertainPublishPanel />
      <section className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 sm:p-4">
        <h2 className="mb-3 text-base font-bold">Paylaşım geçmişi</h2>
        <ShareHistory />
      </section>
    </AdminOsPageShell>
  )
}
