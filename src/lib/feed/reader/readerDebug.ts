/**
 * Feed Reader V1 — temporary pilot runtime diagnostic (non-telemetry).
 * Visible only with ?readerDebug=1 for the exact authenticated pilot.
 * Does not alter Reader open/fallback behavior.
 */

/** Exact P18 Feed Reader pilot — used only for debug panel gate + uidMatch flag. */
export const FEED_READER_DEBUG_PILOT_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

export type FeedReaderLastReadDecision =
  | 'PENDING'
  | 'OPEN_READER'
  | 'CANONICAL_FALLBACK'
  | 'ERROR_FALLBACK'

export type FeedReaderFallbackReason =
  | 'NON_PILOT'
  | 'CAPABILITY_DISABLED'
  | 'CAPABILITY_ERROR'
  | 'AUTH_UNAVAILABLE'
  | 'AUTH_LOADING'
  | 'CAPABILITY_PENDING'
  | 'CONTENT_INELIGIBLE'
  | 'UNKNOWN'
  | null

export type FeedReaderDebugSnapshot = {
  authLoading: boolean
  authenticated: boolean
  uidMatch: boolean
  capabilityRequestStarted: boolean
  capabilityRequestFinished: boolean
  capabilityHTTPStatus: number | null
  capabilityEnabled: boolean
  capabilityReady: boolean
  capabilityAuthenticated: boolean | null
  capabilityErrorCode: string | null
  globalDefault: boolean | null
  lastReadAction: 'button' | 'gesture' | null
  lastReadArticleSlug: string | null
  lastReadDecision: FeedReaderLastReadDecision | null
  lastFallbackReason: FeedReaderFallbackReason
  readerItemSet: boolean
  readerOverlayMounted: boolean
  readerBodyRequestStarted: boolean
  readerBodyHTTPStatus: number | null
  readerBodyErrorCode: string | null
}

export const EMPTY_FEED_READER_DEBUG: FeedReaderDebugSnapshot = {
  authLoading: true,
  authenticated: false,
  uidMatch: false,
  capabilityRequestStarted: false,
  capabilityRequestFinished: false,
  capabilityHTTPStatus: null,
  capabilityEnabled: false,
  capabilityReady: false,
  capabilityAuthenticated: null,
  capabilityErrorCode: null,
  globalDefault: null,
  lastReadAction: null,
  lastReadArticleSlug: null,
  lastReadDecision: null,
  lastFallbackReason: null,
  readerItemSet: false,
  readerOverlayMounted: false,
  readerBodyRequestStarted: false,
  readerBodyHTTPStatus: null,
  readerBodyErrorCode: null,
}

export function isFeedReaderDebugPilot(uid: string | null | undefined): boolean {
  return Boolean(uid && uid === FEED_READER_DEBUG_PILOT_UID)
}

export function shouldShowFeedReaderDebugPanel(opts: {
  readerDebugQuery: boolean
  uid: string | null | undefined
}): boolean {
  return opts.readerDebugQuery && isFeedReaderDebugPilot(opts.uid)
}

/**
 * Pure click-time decision — shared by Haberi Oku + tests.
 * Does not navigate; caller executes OPEN_READER / CANONICAL_FALLBACK.
 */
export function decideFeedReadAction(input: {
  authLoading: boolean
  capabilityReady: boolean
  capabilityEnabled: boolean
  capabilityError: boolean
}): {
  decision: FeedReaderLastReadDecision
  fallbackReason: FeedReaderFallbackReason
} {
  if (input.authLoading) {
    return { decision: 'PENDING', fallbackReason: 'AUTH_LOADING' }
  }
  if (!input.capabilityReady) {
    return { decision: 'PENDING', fallbackReason: 'CAPABILITY_PENDING' }
  }
  if (input.capabilityError) {
    return { decision: 'ERROR_FALLBACK', fallbackReason: 'CAPABILITY_ERROR' }
  }
  if (input.capabilityEnabled) {
    return { decision: 'OPEN_READER', fallbackReason: null }
  }
  return { decision: 'CANONICAL_FALLBACK', fallbackReason: 'CAPABILITY_DISABLED' }
}
