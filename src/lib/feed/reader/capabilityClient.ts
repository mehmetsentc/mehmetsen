/**
 * Client bootstrap for Feed Reader V1 capability.
 * Must not permanently cache unauthenticated `enabled=false` across auth hydration.
 */
import { ensureAuthReady, getClientAuthToken } from '@/lib/firebase/auth'

export type FeedReaderCapabilityResult = {
  enabled: boolean
  authenticated: boolean
}

export async function fetchFeedReaderCapability(opts?: {
  signal?: AbortSignal
  forceAuthRefresh?: boolean
}): Promise<FeedReaderCapabilityResult> {
  await ensureAuthReady()
  const token = await getClientAuthToken(opts?.forceAuthRefresh === true)
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch('/api/feed/v2/reader/capability', {
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
    signal: opts?.signal,
  })
  const data = (await res.json().catch(() => ({}))) as { enabled?: boolean }
  return {
    enabled: Boolean(data.enabled),
    authenticated: Boolean(token),
  }
}

/**
 * Generation guard: ignore stale capability responses when auth uid / loading flips.
 * Returns true when `generation` is still the latest accepted generation.
 */
export function isCapabilityGenerationCurrent(
  generation: number,
  latest: number
): boolean {
  return generation === latest
}
