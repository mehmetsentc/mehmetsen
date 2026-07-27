'use client'

import { useEffect, useState } from 'react'
import { MapPin } from 'lucide-react'
import { getCurrentPosition } from '@/lib/location'
import { nearestProvinceSlug } from '@/constants/cities'
import { getCityCategoryName } from '@/constants/cities'
import {
  readStoredUserLocation,
  writeStoredUserLocation,
  type StoredUserLocation,
} from '@/lib/userLocationStorage'

// v2: önceki sürümlerde markPrompted() Devam'a basıldığında anında çağrılıyordu
// (iOS dialog açılmadan önce). Eski key set edilmiş reviewer cihazları için
// yeni key kullanıyoruz — eski 'prompted' kaydı artık engel değil.
const PROMPT_KEY = 'nahaber-location-prompted-v2'

function markPrompted(): void {
  try {
    localStorage.setItem(PROMPT_KEY, '1')
  } catch {
    // ignore
  }
}

function wasPrompted(): boolean {
  try {
    return localStorage.getItem(PROMPT_KEY) === '1'
  } catch {
    return false
  }
}

function isCapacitorApp(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof (window as unknown as Record<string, unknown>).Capacitor !== 'undefined'
  )
}

/** One-time soft location prompt — non-blocking, does not delay homepage render. */
export function LocationPermission() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (wasPrompted()) return
    const stored = readStoredUserLocation()
    if (stored?.source === 'geolocation' || stored?.source === 'profile') return

    const timer = window.setTimeout(() => setVisible(true), 1200)
    return () => window.clearTimeout(timer)
  }, [])

  /** GPS başarısız olunca IP üzerinden yaklaşık şehir tespit et */
  const fallbackToIpGeo = async () => {
    try {
      // Önce CDN geo (Antalya gibi illerde ip2location’dan daha doğru)
      const cdnRes = await fetch('/api/geo/ip', { cache: 'no-store' })
      if (cdnRes.ok) {
        const geo = (await cdnRes.json()) as { citySlug?: string; cityName?: string; lat?: number | null; lng?: number | null }
        if (geo.citySlug) {
          const record: StoredUserLocation = {
            citySlug: geo.citySlug,
            cityName: geo.cityName || getCityCategoryName(geo.citySlug),
            lat: typeof geo.lat === 'number' ? geo.lat : null,
            lng: typeof geo.lng === 'number' ? geo.lng : null,
            source: 'ip',
            updatedAt: Date.now(),
          }
          writeStoredUserLocation(record)
          window.dispatchEvent(new CustomEvent('nahaber:location-updated', { detail: record }))
          return
        }
      }

      const res = await fetch('/api/geo/detect', { cache: 'no-store' })
      if (!res.ok) return
      const geo = await res.json() as { lat?: number; lng?: number; city?: string; citySlug?: string; cityName?: string }
      const citySlug =
        geo.citySlug ||
        (geo.lat != null && geo.lng != null ? nearestProvinceSlug(geo.lat, geo.lng) : null)
      if (!citySlug) return
      const record: StoredUserLocation = {
        citySlug,
        cityName: geo.cityName || getCityCategoryName(citySlug),
        lat: geo.lat,
        lng: geo.lng,
        source: 'ip',
        updatedAt: Date.now(),
      }
      writeStoredUserLocation(record)
      window.dispatchEvent(new CustomEvent('nahaber:location-updated', { detail: record }))
    } catch {
      // IP geo başarısız → sorun değil, default içerik gösterilir
    }
  }

  const accept = async () => {
    setVisible(false)

    try {
      // iOS Capacitor: CLLocationManager üzerinden native dialog göster.
      // Remote URL modunda navigator.geolocation WKWebView pipeline'ından geçer ve
      // iOS 17+ cihazlarda WKUIDelegate olmadan sessizce başarısız olabilir.
      if (isCapacitorApp()) {
        const { default: NativeGeolocation } = await import('@/plugins/NativeGeolocation')
        const { status } = await NativeGeolocation.requestPermission()
        if (status === 'denied') {
          markPrompted()
          await fallbackToIpGeo() // GPS reddedildi → IP fallback
          return
        }
        // status === 'granted' → get actual position
      }

      const position = await getCurrentPosition()
      const { latitude: lat, longitude: lng } = position.coords
      const citySlug = nearestProvinceSlug(lat, lng)
      const record: StoredUserLocation = {
        citySlug,
        cityName: getCityCategoryName(citySlug),
        lat,
        lng,
        source: 'geolocation',
        updatedAt: Date.now(),
      }
      writeStoredUserLocation(record)
      window.dispatchEvent(new CustomEvent('nahaber:location-updated', { detail: record }))
      markPrompted() // Sadece başarılı olunca işaretle
    } catch {
      // GPS permission denied veya unavailable → IP fallback ile dene
      await fallbackToIpGeo()
      markPrompted()
    }
  }

  if (!visible) return null

  return (
    <div className="fixed bottom-[calc(4.5rem+var(--safe-bottom,0px))] left-3 right-3 z-[110] md:bottom-6 md:left-auto md:right-6 md:max-w-sm">
      <div className="rounded-2xl border border-[rgb(var(--color-border))] bg-[rgb(var(--color-card))] p-4 shadow-xl">
        <div className="mb-2 flex items-center gap-2">
          <MapPin className="h-5 w-5 shrink-0 text-[rgb(var(--color-brand))]" />
          <p className="text-sm font-bold text-[rgb(var(--color-text))]">Konumunu paylaş</p>
        </div>
        <p className="mb-3 text-xs leading-relaxed text-[rgb(var(--color-muted))]">
          Yakınındaki haberleri ve etkinlikleri gösterebilmemiz için konum izni gerekiyor.
        </p>
        <button
          type="button"
          onClick={accept}
          className="w-full rounded-xl bg-[rgb(var(--color-brand))] px-3 py-2 text-xs font-bold text-white"
        >
          Devam
        </button>
      </div>
    </div>
  )
}
