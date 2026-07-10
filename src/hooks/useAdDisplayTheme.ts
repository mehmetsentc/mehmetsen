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
 * - Kullanıcı light/dark/oled seçtiyse → uygulama teması (site ile aynı)
 * - Sadece "system" modunda → konum + güneş doğuş/batış saati
 */
export function useAdDisplayTheme(): AdDisplayTheme {
  const { theme, resolvedTheme } = useTheme()
  const { coords, citySlug, ready } = useUserLocation()
  const appTheme: AdDisplayTheme = resolvedTheme === 'light' ? 'light' : 'dark'

  const [solarTheme, setSolarTheme] = useState<AdDisplayTheme>(appTheme)

  useEffect(() => {
    if (theme !== 'system') return

    if (!ready) {
      setSolarTheme(appTheme)
      return
    }

    const lat = coords?.lat ?? getProvinceCoords(citySlug)?.lat ?? DEFAULT_COORDS.lat
    const lng = coords?.lng ?? getProvinceCoords(citySlug)?.lng ?? DEFAULT_COORDS.lng

    const update = () => {
      setSolarTheme(getAdDisplayThemeFromLocation(lat, lng))
    }

    update()
    const id = window.setInterval(update, 60_000)
    return () => window.clearInterval(id)
  }, [theme, ready, coords?.lat, coords?.lng, citySlug, appTheme])

  if (theme !== 'system') return appTheme
  if (!ready) return appTheme
  return solarTheme
}
