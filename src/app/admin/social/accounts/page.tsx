'use client'

import { Suspense } from 'react'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import { SocialAccountsManager } from '@/components/social/SocialAccountsManager'

export default function SocialAdminAccountsPage() {
  return (
    <AdminOsPageShell title="Hesaplar" subtitle="Merkez, il ve yayıncı hesapları — bağlantı, yayın izni ve otomasyon ayrı gösterilir">
      <SocialAdminNav />
      <div className="rounded-xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-3 sm:p-4">
        <Suspense fallback={null}>
          <SocialAccountsManager mode="admin" />
        </Suspense>
      </div>
      <p className="text-xs text-[rgb(var(--color-muted))]">
        Kişisel hesaplar yalnızca sahibine görünür. Yayıncı hesapları merkezde salt okunur listelenir; yönetimi yayıncı ekibindedir.
      </p>
    </AdminOsPageShell>
  )
}
