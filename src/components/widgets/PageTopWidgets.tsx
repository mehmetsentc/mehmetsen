'use client'

import { MatchStripMini } from './MatchStripMini'
import { WeatherMini } from './WeatherMini'
import { HoroscopeMini } from './HoroscopeMini'

/**
 * Haber kaydırıcısının altındaki widget bölümü (kategori sayfaları):
 * - Maç şeridi (yeşil arka plan)
 * - Hava durumu + Günlük burç (yan yana)
 *
 * NOT: FinanceTicker SADECE ana sayfada (/feed) gösterilir.
 */
export function PageTopWidgets() {
  return (
    <div className="mb-4 space-y-0">
      {/* Matches: horizontal green strip */}
      <MatchStripMini />

      {/* Weather + Horoscope side by side */}
      <div className="grid grid-cols-2 gap-2">
        <WeatherMini />
        <HoroscopeMini />
      </div>
    </div>
  )
}
