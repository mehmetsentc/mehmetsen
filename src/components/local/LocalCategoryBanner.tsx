'use client'

/**
 * LocalCategoryBanner
 *
 * Web'de /kategori/yerel-haber sayfasında gösterilir.
 * Kullanıcıyı şehre özel haber sayfasına (/local) yönlendirir.
 * Mevcut saklı şehri gösterir, varsa.
 */

import Link from 'next/link'
import { MapPin, ChevronRight } from 'lucide-react'
import { useEffect, useState } from 'react'
import { readStoredUserLocation } from '@/lib/userLocationStorage'

export function LocalCategoryBanner() {
  const [cityName, setCityName] = useState<string | null>(null)

  useEffect(() => {
    const stored = readStoredUserLocation()
    if (stored?.cityName) setCityName(stored.cityName)
  }, [])

  return (
    <Link
      href="/local"
      className="mb-4 flex items-center gap-3 rounded-2xl border border-[rgb(var(--color-brand))]/30 bg-[rgb(var(--color-brand))]/5 px-4 py-3 transition-colors hover:bg-[rgb(var(--color-brand))]/10"
    >
      <MapPin className="h-5 w-5 shrink-0 text-[rgb(var(--color-brand))]" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold text-[rgb(var(--color-text))]">
          {cityName ? `${cityName} haberleri` : 'Şehrine özel haberler'}
        </p>
        <p className="text-[11px] text-[rgb(var(--color-muted))]">
          {cityName
            ? 'Konumunu değiştirmek için tıkla'
            : 'GPS veya şehir seçerek filtrele'}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[rgb(var(--color-muted))]" />
    </Link>
  )
}
