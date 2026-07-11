'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { getCityCategoryName, nearestProvinceSlug } from '@/constants/cities'
import { useAuth } from '@/hooks/useAuth'
import { useConsent } from '@/hooks/useConsent'
import { fetchIpLocation } from '@/lib/ipGeolocation'
import { getCurrentPosition, slugifyCity } from '@/lib/location'
import { getPrivacyPreferences } from '@/lib/userPreferences'
import {
  DEFAULT_USER_CITY_SLUG,
  readCityCookie,
  readStoredUserLocation,
  writeStoredUserLocation,
  type StoredUserLocation,
  type UserLocationSource,
} from '@/lib/userLocationStorage'

export interface UserCoords {
  lat: number
  lng: number
}

export interface UserLocationValue {
  citySlug: string
  cityName: string
  coords: UserCoords | null
  source: UserLocationSource
  loading: boolean
  ready: boolean
}

const UserLocationContext = createContext<UserLocationValue | undefined>(undefined)

function resolveProfileCity(user: {
  citySlug?: string | null
  location?: string | null
} | null): { citySlug: string; cityName: string } | null {
  if (!user) return null

  const fromSlug = user.citySlug?.trim().toLowerCase()
  if (fromSlug) {
    return { citySlug: fromSlug, cityName: getCityCategoryName(fromSlug) }
  }

  const fromLocation = user.location?.trim()
  if (fromLocation) {
    const slug = slugifyCity(fromLocation)
    if (slug) {
      return { citySlug: slug, cityName: getCityCategoryName(slug) || fromLocation }
    }
  }

  return null
}

function persistLocation(
  citySlug: string,
  cityName: string,
  source: UserLocationSource,
  coords?: UserCoords | null
): StoredUserLocation {
  const record: StoredUserLocation = {
    citySlug,
    cityName,
    lat: coords?.lat ?? null,
    lng: coords?.lng ?? null,
    source,
    updatedAt: Date.now(),
  }
  writeStoredUserLocation(record)
  return record
}

async function resolveIpOrFallback(
  applyLocation: (
    citySlug: string,
    cityName: string,
    source: UserLocationSource,
    coords?: UserCoords | null
  ) => void
): Promise<void> {
  const ip = await fetchIpLocation()
  if (ip?.citySlug) {
    applyLocation(
      ip.citySlug,
      ip.cityName,
      'ip',
      ip.lat != null && ip.lng != null ? { lat: ip.lat, lng: ip.lng } : null
    )
    return
  }

  applyLocation(
    DEFAULT_USER_CITY_SLUG,
    getCityCategoryName(DEFAULT_USER_CITY_SLUG),
    'fallback'
  )
}

export function UserLocationProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { ready: consentReady, marketingAllowed } = useConsent()
  const geoRequestedRef = useRef(false)

  const [state, setState] = useState<Omit<UserLocationValue, 'ready'>>({
    citySlug: DEFAULT_USER_CITY_SLUG,
    cityName: getCityCategoryName(DEFAULT_USER_CITY_SLUG),
    coords: null,
    source: 'fallback',
    loading: true,
  })
  const [ready, setReady] = useState(false)

  const applyLocation = useCallback(
    (
      citySlug: string,
      cityName: string,
      source: UserLocationSource,
      coords?: UserCoords | null
    ) => {
      persistLocation(citySlug, cityName, source, coords)
      setState({
        citySlug,
        cityName,
        coords: coords ?? null,
        source,
        loading: false,
      })
      setReady(true)
    },
    []
  )

  useEffect(() => {
    if (authLoading) return

    const profile = resolveProfileCity(user)
    if (profile) {
      applyLocation(profile.citySlug, profile.cityName, 'profile')
      return
    }

    const stored = readStoredUserLocation()
    if (stored?.citySlug) {
      setState({
        citySlug: stored.citySlug,
        cityName: stored.cityName || getCityCategoryName(stored.citySlug),
        coords:
          stored.lat != null && stored.lng != null
            ? { lat: stored.lat, lng: stored.lng }
            : null,
        source: stored.source,
        loading: false,
      })
      setReady(true)
      return
    }

    const cookieSlug = readCityCookie()
    if (cookieSlug) {
      applyLocation(cookieSlug, getCityCategoryName(cookieSlug), 'cookie')
      return
    }

    setState((prev) => ({ ...prev, loading: true }))
  }, [authLoading, user?.uid, user?.citySlug, user?.location, applyLocation])

  useEffect(() => {
    if (authLoading || !consentReady || geoRequestedRef.current) return
    if (resolveProfileCity(user)) return

    const stored = readStoredUserLocation()
    if (stored?.source === 'profile' || stored?.source === 'geolocation' || stored?.source === 'manual') return

    const privacy = getPrivacyPreferences()
    const mayUseGeolocation = privacy.shareLocation || marketingAllowed
    if (!mayUseGeolocation) {
      void resolveIpOrFallback(applyLocation)
      return
    }

    geoRequestedRef.current = true

    void (async () => {
      try {
        const position = await getCurrentPosition()
        const { latitude: lat, longitude: lng } = position.coords
        const slug = nearestProvinceSlug(lat, lng)
        applyLocation(slug, getCityCategoryName(slug), 'geolocation', { lat, lng })
      } catch {
        await resolveIpOrFallback(applyLocation)
      }
    })()
  }, [authLoading, consentReady, marketingAllowed, user, applyLocation])

  const value = useMemo<UserLocationValue>(
    () => ({ ...state, ready }),
    [state, ready]
  )

  return (
    <UserLocationContext.Provider value={value}>{children}</UserLocationContext.Provider>
  )
}

export function useUserLocationContext(): UserLocationValue {
  const ctx = useContext(UserLocationContext)
  if (!ctx) {
    return {
      citySlug: DEFAULT_USER_CITY_SLUG,
      cityName: getCityCategoryName(DEFAULT_USER_CITY_SLUG),
      coords: null,
      source: 'fallback',
      loading: false,
      ready: true,
    }
  }
  return ctx
}
