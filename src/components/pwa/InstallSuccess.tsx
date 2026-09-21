'use client'

import { Check } from 'lucide-react'
import { BrandWordmark } from '@/components/brand/BrandWordmark'
import { ROUTES } from '@/constants/routes'
import Link from 'next/link'

export function InstallSuccess({ onContinue }: { onContinue?: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[420] flex items-end justify-center bg-black/70 px-4 pb-8 pt-16 sm:items-center"
      role="dialog"
      aria-label="NaHaber hazır"
      data-testid="pwa-install-success"
    >
      <div className="nah-install-modal w-full px-6 py-8 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-[rgb(var(--nah-red))] text-3xl font-black text-white">
          N
        </div>
        <BrandWordmark variant="onBrand" size="md" className="font-black" />
        <h2 className="mt-5 text-2xl font-extrabold text-white">NaHaber hazır!</h2>
        <ul className="mt-5 space-y-2 text-left text-sm text-white/80">
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" /> Ana ekrana eklendi
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" /> Hızlı açılış aktif
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-white/35" /> Bildirimler daha sonra açılabilir
          </li>
          <li className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" /> Kişisel haber akışın hazır
          </li>
        </ul>
        <Link
          href={ROUTES.FEED}
          onClick={onContinue}
          className="nah-cta mt-7"
        >
          NaHaber&apos;e Git
        </Link>
      </div>
    </div>
  )
}
