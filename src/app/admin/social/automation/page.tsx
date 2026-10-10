'use client'

import Link from 'next/link'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { AutomationRulesPanel } from '@/components/admin/social/AutomationRulesPanel'

export default function SocialAutomationRulesPage() {
  return (
    <AdminOsPageShell
      title="Otomasyon Kuralları"
      subtitle="Hesap bazlı otomatik paylaşım — her kural tek bir bağlı hesaba bağlıdır"
      actions={
        <div className="flex gap-2">
          <Link href="/admin/social" className="rounded-lg border border-[rgb(var(--color-border))] px-3 py-2 text-xs font-semibold">
            Hesaplar ve manuel paylaşım
          </Link>
        </div>
      }
    >
      <AutomationRulesPanel />
    </AdminOsPageShell>
  )
}
