'use client'

import { useEffect, useState } from 'react'
import { useUserLocation } from '@/hooks/useUserLocation'
import {
  getAdDisplayThemeFromLocation,
  getProvinceCoords,
  type AdDisplayTheme,
} from '@/lib/solarTime'
import { useTheme } from '@/store/themeContext'

const DEFAULT_COORDS = { lat: 41.0082, lng: 28.9784 } // İstanbul

/**
 * Reklam banner'ı için görüntüleme teması.
 * Öncelik: kullanıcı konumu + güneş doğuş/batış saati.
 * Konum yoksa uygulama temasına düşer.
 */
export function useAdDisplayTheme(): AdDisplayTheme {
  const { coords, citySlug, ready } = useUserLocation()
  const { resolvedTheme } = useTheme()
  const fallback: AdDisplayTheme = resolvedTheme === 'light' ? 'light' : 'dark'

  const [displayTheme, setDisplayTheme] = useState<AdDisplayTheme>(fallback)

  useEffect(() => {
    if (!ready) return

    const lat = coords?.lat ?? getProvinceCoords(citySlug)?.lat ?? DEFAULT_COORDS.lat
    const lng = coords?.lng ?? getProvinceCoords(citySlug)?.lng ?? DEFAULT_COORDS.lng

    const update = () => {
      setDisplayTheme(getAdDisplayThemeFromLocation(lat, lng))
    }

    update()
    const id = window.setInterval(update, 60_000)
    return () => window.clearInterval(id)
  }, [coords?.lat, coords?.lng, citySlug, ready])

  return displayTheme
}
