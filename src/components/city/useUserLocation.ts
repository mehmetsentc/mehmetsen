'use client'

import { useCallback, useEffect, useState } from 'react'
import type { LatLng } from '@/lib/cityServices/geo'

export type LocationStatus = 'idle' | 'locating' | 'ready' | 'denied' | 'unavailable'

/**
 * Asks for the visitor's position only on tap. If the browser already granted it
 * earlier, it is picked up silently on mount. The position never leaves the device.
 */
export function useUserLocation() {
  const [status, setStatus] = useState<LocationStatus>('idle')
  const [position, setPosition] = useState<LatLng | null>(null)

  const locate = useCallback(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable')
      return
    }
    setStatus('locating')
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPosition({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setStatus('ready')
      },
      (err) => setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  useEffect(() => {
    let cancelled = false
    const perms = typeof navigator !== 'undefined' ? navigator.permissions : undefined
    if (!perms?.query) return
    perms
      .query({ name: 'geolocation' as PermissionName })
      .then((res) => {
        if (!cancelled && res.state === 'granted') locate()
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [locate])

  return { status, position, locate }
}
