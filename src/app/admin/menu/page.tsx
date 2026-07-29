'use client'

import { MobileMenu } from '@/components/admin/mobile/MobileMenu'
import { useIsMobileAdminViewport } from '@/hooks/useIsMobileAdminViewport'

export default function AdminMenuPage() {
  const isMobile = useIsMobileAdminViewport()

  if (isMobile === null) {
    return <div className="p-4 text-sm text-[rgb(var(--color-muted))]">Yükleniyor…</div>
  }

  if (!isMobile) {
    return (
      <div className="p-8">
        <p className="text-sm text-[rgb(var(--color-muted))]">
          Menü mobil navigasyon içindir. Sol kenar çubuğunu kullanın.
        </p>
      </div>
    )
  }

  return <MobileMenu />
}
