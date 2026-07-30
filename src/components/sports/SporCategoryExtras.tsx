'use client'

import Link from 'next/link'
import { Trophy } from 'lucide-react'
import { TransferStrip } from '@/components/sports/TransferStrip'
import { ROUTES } from '@/constants/routes'

/**
 * /kategori/spor üst slot — ince NaHaber Skor CTA + transfer şeridi.
 * Tam skor panosu /skor sayfasında.
 */
export function SporCategoryExtras() {
  return (
    <div className="space-y-4">
      <Link href={ROUTES.SKOR} className="skor-cta" aria-label="NaHaber Skor’a git">
        <div className="flex min-w-0 items-start gap-2.5">
          <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-[rgb(var(--color-brand))]" aria-hidden />
          <div className="min-w-0">
            <p className="skor-cta__title">Canlı skor</p>
            <p className="skor-cta__sub">Futbol · Basketbol · Voleybol — NaHaber Skor</p>
          </div>
        </div>
        <span className="skor-cta__go">Skor →</span>
      </Link>
      <TransferStrip />
    </div>
  )
}
