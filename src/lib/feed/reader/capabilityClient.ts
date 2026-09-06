/**
 * Client bootstrap for Feed Reader V1 capability.
 * Must not permanently cache unauthenticated `enabled=false` across auth hydration.
 */
import { ensureAuthReady, getClientAuthToken } from '@/lib/firebase/auth'
import type { SafeAuthProviderKind } from '@/lib/feed/reader/pilotIdentityDebugTypes'

export type FeedReaderIdentityDebug = {
  currentUidPresent: boolean
  historicalGoogleCandidateExists: boolean
  historicalGoogleCandidateProvider: 'GOOGLE'
  currentMatchesHistoricalGooglePilot: boolean
  currentMatchesProgrammaticOperator: boolean
  /** Grant-backed Reader pilot match — same authority as capability.enabled. */
  currentMatchesActiveFeedReaderGrant: boolean | null
  currentProviderType: SafeAuthProviderKind | null
  currentFirebaseRecordValid: boolean | null
  currentDisabled: boolean | null
  currentProfileExists: boolean | null
  currentTermsAccepted: boolean | null
  historicalProviderStillGoogleLinked: boolean | null
  historicalCandidateDisabled: boolean | null
}

export type FeedReaderCapabilityResult = {
  enabled: boolean
  authenticated: boolean
  httpStatus: number
  globalDefault: boolean | null
  feature: string | null
  errorCode: string | null
  /** Server-reported: whether verifyFirebaseIdToken resolved a uid (no uid value). */
  serverAuthenticated: boolean | null
  /** Present only when fetch used readerDebug=1 — never contains UID/PII. */
  identityDebug: FeedReaderIdentityDebug | null
}

export async function fetchFeedReaderCapability(opts?: {
  signal?: AbortSignal
  forceAuthRefresh?: boolean
  /** When true, server may attach safe identityDebug booleans (no UID). */
  readerDebug?: boolean
}): Promise<FeedReaderCapabilityResult> {
  await ensureAuthReady()
  const token = await getClientAuthToken(opts?.forceAuthRefresh === true)
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {}
  const qs = opts?.readerDebug ? '?readerDebug=1' : ''
  const res = await fetch(`/api/feed/v2/reader/capability${qs}`, {
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
    identityDebug?: FeedReaderIdentityDebug
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
    identityDebug:
      data.identityDebug && typeof data.identityDebug === 'object'
        ? data.identityDebug
        : null,
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
