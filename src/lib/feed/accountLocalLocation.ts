/**
 * Account-persisted Yerel location helpers (client).
 * Precedence for authenticated users: server citySlug > device cache (unless cleared).
 * Guests: device nahaber-local-news-city only. No silent GPS / IP authority.
 */
import {
  clearLocalNewsCitySlug,
  readLocalNewsCitySlug,
  writeLocalNewsCitySlug,
} from '@/lib/userLocationStorage'
import { getClientAuthToken } from '@/lib/firebase/auth'

export type AccountLocalLocation = {
  citySlug: string | null
  districtSlug: string | null
  cleared: boolean
  cityDisplay: string | null
  country: string | null
}

const CLEARED_SENTINEL_KEY = 'nahaber-local-news-cleared'

export function readLocalClearedSentinel(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(CLEARED_SENTINEL_KEY) === '1'
  } catch {
    return false
  }
}

export function writeLocalClearedSentinel(cleared: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (cleared) localStorage.setItem(CLEARED_SENTINEL_KEY, '1')
    else localStorage.removeItem(CLEARED_SENTINEL_KEY)
  } catch {
    /* ignore */
  }
}

export async function fetchAccountLocalLocation(): Promise<AccountLocalLocation | null> {
  const token = await getClientAuthToken()
  if (!token) return null
  const res = await fetch('/api/users/me/local-location', {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })
  if (!res.ok) return null
  const data = (await res.json()) as AccountLocalLocation
  return data
}

export async function persistAccountLocalLocation(opts: {
  citySlug: string | null
  districtSlug?: string | null
  clear?: boolean
}): Promise<boolean> {
  const token = await getClientAuthToken()
  if (!token) return false
  const res = await fetch('/api/users/me/local-location', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      citySlug: opts.clear ? null : opts.citySlug,
      districtSlug: opts.clear ? null : opts.districtSlug ?? null,
      clear: Boolean(opts.clear),
    }),
  })
  return res.ok
}

/**
 * Resolve Yerel city for request:
 * 1. Explicit cleared → null
 * 2. Account citySlug (authed)
 * 3. Device nahaber-local-news-city
 * Never uses IP/fallback as authority.
 */
export async function resolveYerelCityForRequest(opts: {
  authed: boolean
  inMemorySlug?: string | null
}): Promise<{ citySlug: string | null; districtSlug: string | null; source: string }> {
  if (opts.inMemorySlug) {
    return { citySlug: opts.inMemorySlug, districtSlug: null, source: 'session' }
  }
  if (readLocalClearedSentinel()) {
    return { citySlug: null, districtSlug: null, source: 'cleared' }
  }
  if (opts.authed) {
    const account = await fetchAccountLocalLocation()
    if (account?.cleared) {
      writeLocalClearedSentinel(true)
      clearLocalNewsCitySlug()
      return { citySlug: null, districtSlug: null, source: 'account_cleared' }
    }
    if (account?.citySlug) {
      // Server wins over stale device cache for authed users.
      writeLocalNewsCitySlug(account.citySlug)
      writeLocalClearedSentinel(false)
      return {
        citySlug: account.citySlug,
        districtSlug: account.districtSlug,
        source: 'account',
      }
    }
  }
  const device = readLocalNewsCitySlug()
  if (device) return { citySlug: device, districtSlug: null, source: 'device' }
  return { citySlug: null, districtSlug: null, source: 'none' }
}
