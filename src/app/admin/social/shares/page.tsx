'use client'

import { Suspense, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { AdminOsPageShell } from '@/components/admin/os/AdminOsPageShell'
import { SocialAdminNav } from '@/components/admin/social/SocialAdminNav'
import { UncertainPublishPanel } from '@/components/admin/social/UncertainPublishPanel'
import { ShareComposer } from '@/components/social/ShareComposer'
import { ShareHistory } from '@/components/social/ShareHistory'
import type { SocialAccountRow } from '@/components/social/socialClient'
import { MobileShares } from '@/components/admin/mobile/MobileShares'
import { useIsMobileAdminViewport } from '@/hooks/useIsMobileAdminViewport'

/** `?account=<id>` (from an account card's «Paylaşım geçmişi») narrows the history to that account. */
function HistoryForAccount() {
  const account = useSearchParams().get('account')
  const only = useCallback((a: SocialAccountRow) => a.id === account, [account])
  return (
    <>
      {account ? (
        <p className="mb-2 text-xs text-[rgb(var(--color-muted))]">
          Yalnız seçili hesabın kayıtları gösteriliyor.{' '}
          <Link href="/admin/social/shares" className="font-semibold underline">
            Tümünü göster
          </Link>
        </p>
      ) : null}
      <ShareHistory accountFilter={account ? only : undefined} />
    </>
  )
}

export default function SocialAdminSharesPage() {
  // MOBILE-ADMIN-1: the «Paylaşım» tab on phones / tablets.
  const isMobile = useIsMobileAdminViewport()
  if (isMobile === null) return null
  if (isMobile) return <MobileShares />
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
        <Suspense fallback={null}>
          <HistoryForAccount />
        </Suspense>
      </section>
    </AdminOsPageShell>
  )
}
