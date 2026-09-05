/**
 * Client bootstrap for Feed Reader V1 capability.
 * Must not permanently cache unauthenticated `enabled=false` across auth hydration.
 */
import { ensureAuthReady, getClientAuthToken } from '@/lib/firebase/auth'

export type FeedReaderCapabilityResult = {
  enabled: boolean
  authenticated: boolean
  httpStatus: number
  globalDefault: boolean | null
  feature: string | null
  errorCode: string | null
  /** Server-reported: whether verifyFirebaseIdToken resolved a uid (no uid value). */
  serverAuthenticated: boolean | null
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
  const data = (await res.json().catch(() => ({}))) as {
    enabled?: boolean
    globalDefault?: boolean
    feature?: string
    reason?: string
    authenticated?: boolean
  }
  return {
    enabled: Boolean(data.enabled),
    authenticated: Boolean(token),
    httpStatus: res.status,
    globalDefault: typeof data.globalDefault === 'boolean' ? data.globalDefault : null,
    feature: typeof data.feature === 'string' ? data.feature : null,
    errorCode: typeof data.reason === 'string' ? data.reason : res.ok ? null : `http_${res.status}`,
    serverAuthenticated:
      typeof data.authenticated === 'boolean' ? data.authenticated : null,
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
