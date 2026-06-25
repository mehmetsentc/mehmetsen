'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'

interface SidebarInstallCTAProps {
  onNavigate?: () => void
}

/**
 * Sidebar'da "Uygulamayı yükle" mini banner.
 *
 * Sadece şu durumlarda görünür:
 *  - PWA standalone değilse (zaten yüklü değil)
 *  - 14 günlük dismiss cooldown geçerli değilse
 *
 * Tıklanınca /uygulama sayfasına gider. Sidebar zaten "use client" olduğu
 * için ek hidrasyon maliyeti yok.
 */
export function SidebarInstallCTA({ onNavigate }: SidebarInstallCTAProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) return

    try {
      const dismissedAt = localStorage.getItem('nahaber:sidebar-install-dismissed-at')
      if (dismissedAt) {
        const ts = Number(dismissedAt)
        if (Number.isFinite(ts) && Date.now() - ts < 14 * 86_400_000) return
      }
    } catch {
      /* localStorage erişimi yoksa göster */
    }

    setShow(true)
  }, [])

  if (!show) return null

  return (
    <Link
      href="/uygulama"
      onClick={onNavigate}
      className="mb-2 flex items-center gap-2.5 rounded-xl border border-brand-500/30 bg-gradient-to-br from-brand-500/10 to-transparent px-3 py-2.5 text-xs font-semibold text-text-primary transition-colors hover:from-brand-500/20"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
        <Download className="h-3.5 w-3.5" />
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[11px] font-bold">NaHaber&apos;ı yükle</span>
        <span className="text-[10px] font-medium text-text-tertiary">
          Ana ekranına ekle · 3 sn
        </span>
      </span>
    </Link>
  )
}
