'use client'

import { Suspense } from 'react'
import { MobileQuickComposer } from '@/components/admin/mobile/MobileQuickComposer'
import { useIsMobileAdminViewport } from '@/hooks/useIsMobileAdminViewport'

function QuickInner() {
  const isMobile = useIsMobileAdminViewport()

  if (isMobile === null) {
    return <div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>
  }

  if (!isMobile) {
    return (
      <div className="p-8">
        <p className="text-sm text-[rgb(var(--color-muted))]">
          Hızlı haber bestesi mobil içindir.{' '}
          <a href="/admin/news/create" className="font-semibold text-[rgb(var(--color-brand))]">
            Masaüstü editöre git
          </a>
        </p>
      </div>
    )
  }

  return <MobileQuickComposer />
}

export default function AdminQuickPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm">Yükleniyor…</div>}>
      <QuickInner />
    </Suspense>
  )
}
