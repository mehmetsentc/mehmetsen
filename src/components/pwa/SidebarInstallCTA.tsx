'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Download } from 'lucide-react'
import { shouldShowWebInstallCta } from '@/lib/platform'

interface SidebarInstallCTAProps {
  onNavigate?: () => void
}

/**
 * Sidebar'da "Uygulamayı yükle" mini banner.
 *
 * Sadece web / tarayıcıda görünür:
 *  - Native App Store / Play Store shell'de asla (Capacitor / Cordova)
 *  - PWA standalone değilse (zaten ana ekrana ekli değil)
 *  - 14 günlük dismiss cooldown geçerli değilse
 *
 * Tıklanınca /uygulama sayfasına gider.
 */
export function SidebarInstallCTA({ onNavigate }: SidebarInstallCTAProps) {
  const [show, setShow] = useState(false)

  useEffect(() => {
    // App Store / Play Capacitor: never show “Yükle / Ana ekrana ekle”
    if (!shouldShowWebInstallCta()) return

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
          Ana ekranına ekle · ücretsiz
        </span>
      </span>
    </Link>
  )
}
