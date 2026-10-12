'use client'

import { Suspense, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { AutomationRulesPanel } from '@/components/admin/social/AutomationRulesPanel'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import type { SocialAccountPublic } from '@/lib/social/accounts/types'

/** `?account=<id>` (from an account card) narrows the page to that account; «Yeni kural» then starts with it. */
function RulesForAccount() {
  const account = useSearchParams().get('account')
  const only = useCallback((a: SocialAccountPublic) => a.id === account, [account])
  return (
    <>
      {account ? (
        <p className="text-xs text-[rgb(var(--color-muted))]">
          Yalnız seçili hesabın kuralları gösteriliyor.{' '}
          <Link href="/admin/social/automation" className="font-semibold underline">
            Tüm hesapları göster
          </Link>
        </p>
      ) : null}
      <AutomationRulesPanel ownerFilter={account ? only : undefined} />
    </>
  )
}

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
      <SocialAdminNav />
      <Suspense fallback={null}>
        <RulesForAccount />
      </Suspense>
    </AdminOsPageShell>
  )
}
