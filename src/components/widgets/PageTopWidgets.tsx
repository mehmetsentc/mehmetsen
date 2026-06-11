'use client'

import { FinanceTicker } from './FinanceTicker'
import { MatchStripMini } from './MatchStripMini'
import { WeatherMini } from './WeatherMini'
import { HoroscopeMini } from './HoroscopeMini'

/**
 * Haber kaydırıcısının altındaki widget bölümü:
 * - Döviz/kur kartları (USD, EUR, Altın, BTC, BIST)
 * - Maç şeridi (yeşil arka plan)
 * - Hava durumu + Günlük burç (yan yana)
 */
export function PageTopWidgets() {
  return (
    <div className="mb-4 space-y-0">
      {/* Finance: USD / EUR / Altın / BTC / BIST */}
      <FinanceTicker />

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
