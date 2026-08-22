'use client'

import { TransferStrip } from '@/components/sports/TransferStrip'

/**
 * /kategori/spor üst slot — transfer şeridi.
 * NaHaber Skor CTA kaldırıldı (skor API prod'da güvenilir değil).
 */
export function SporCategoryExtras() {
  return (
    <div className="space-y-4">
      <TransferStrip />
    </div>
  )
}
