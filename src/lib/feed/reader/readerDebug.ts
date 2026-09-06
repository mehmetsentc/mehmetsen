/**
 * Feed Reader V1 — temporary runtime diagnostic (non-telemetry).
 * Visible with ?readerDebug=1 for ANY visitor (safe fields only).
 * Does not alter Reader open/fallback behavior.
 */

/**
 * Historical programmatic operator UID — informational only.
 * Do NOT use as active pilotMatch / authorization truth after P18 transfer.
 */
export const FEED_READER_DEBUG_PILOT_UID = 'wG8WTNlW38TILLvpDLsFmt8IMlg1'

/**
 * Resolve grant-backed pilotMatch for the debug badge.
 * Prefer server currentMatchesActiveFeedReaderGrant; else capabilityEnabled once ready.
 */
export function resolveGrantBackedPilotMatch(input: {
  currentMatchesActiveFeedReaderGrant?: boolean | null
  capabilityReady?: boolean
  capabilityEnabled?: boolean
  authenticated?: boolean
}): boolean {
  if (typeof input.currentMatchesActiveFeedReaderGrant === 'boolean') {
    return input.currentMatchesActiveFeedReaderGrant
  }
  if (input.capabilityReady && input.authenticated) {
    return Boolean(input.capabilityEnabled)
  }
  return false
}

export type FeedReaderLastReadDecision =
  | 'PENDING'
  | 'OPEN_READER'
  | 'CANONICAL_FALLBACK'
  | 'ERROR_FALLBACK'

/** Human-facing click decision labels for the debug badge. */
export type FeedReaderClickCapabilityState = 'PENDING' | 'ENABLED' | 'DISABLED'

export type FeedReaderClickReadDecision =
  | 'OPEN_READER'
  | 'CANONICAL_FALLBACK'
  | 'WAIT_FOR_CAPABILITY'
  | 'ERROR_FALLBACK'
  | null

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

export type FeedReaderGestureDecision =
  | 'NONE'
  | 'SNAP_BACK'
  | 'OPEN_READER'
  | 'IGNORED_INTERACTIVE'
  | 'IGNORED_IOS_EDGE'
  | 'CANCELLED'
  | 'HANDLER_ABSENT'

export type FeedReaderDebugPath = 'FEED' | 'CANONICAL_ARTICLE' | null

export type FeedReaderDebugSnapshot = {
  authLoading: boolean
  authenticated: boolean
  /** pilotMatch — grant-backed Reader authorization (never raw UID). */
  uidMatch: boolean
  /** Explicit grant field (same meaning as uidMatch when server identityDebug present). */
  currentMatchesActiveFeedReaderGrant: boolean | null
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
  /** Gesture forensic — no PII / no engagement telemetry. */
  gestureHandlerAttached: boolean
  pointerDownReceived: boolean
  pointerMoveReceived: boolean
  pointerUpReceived: boolean
  pointerCancelReceived: boolean
  gestureDx: number | null
  gestureDy: number | null
  gestureAxis: 'none' | 'horizontal' | 'vertical' | null
  gestureQualified: boolean
  gestureDecision: FeedReaderGestureDecision | null
  onReadCalled: boolean
  readerOpenRequested: boolean
  /** Click-time truth (Haberi Oku / gesture) — local only. */
  lastReadClick: boolean
  capabilityAtClick: FeedReaderClickCapabilityState | null
  readDecision: FeedReaderClickReadDecision
  openReaderCalled: boolean
  routerPushCanonicalCalled: boolean
  readerComponentRendered: boolean
  readerUnmountReason: string | null
  currentPath: FeedReaderDebugPath
  /** Server identity debug (readerDebug capability) — no UID/PII. */
  currentUidPresent: boolean | null
  historicalGoogleCandidateExists: boolean | null
  historicalGoogleCandidateProvider: 'GOOGLE' | null
  currentMatchesHistoricalGooglePilot: boolean | null
  currentMatchesProgrammaticOperator: boolean | null
  currentProviderType: string | null
  currentFirebaseRecordValid: boolean | null
  currentDisabled: boolean | null
  currentProfileExists: boolean | null
  currentTermsAccepted: boolean | null
  historicalProviderStillGoogleLinked: boolean | null
  historicalCandidateDisabled: boolean | null
}

export const EMPTY_FEED_READER_DEBUG: FeedReaderDebugSnapshot = {
  authLoading: true,
  authenticated: false,
  uidMatch: false,
  currentMatchesActiveFeedReaderGrant: null,
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
  gestureHandlerAttached: false,
  pointerDownReceived: false,
  pointerMoveReceived: false,
  pointerUpReceived: false,
  pointerCancelReceived: false,
  gestureDx: null,
  gestureDy: null,
  gestureAxis: null,
  gestureQualified: false,
  gestureDecision: null,
  onReadCalled: false,
  readerOpenRequested: false,
  lastReadClick: false,
  capabilityAtClick: null,
  readDecision: null,
  openReaderCalled: false,
  routerPushCanonicalCalled: false,
  readerComponentRendered: false,
  readerUnmountReason: null,
  currentPath: 'FEED',
  currentUidPresent: null,
  historicalGoogleCandidateExists: null,
  historicalGoogleCandidateProvider: null,
  currentMatchesHistoricalGooglePilot: null,
  currentMatchesProgrammaticOperator: null,
  currentProviderType: null,
  currentFirebaseRecordValid: null,
  currentDisabled: null,
  currentProfileExists: null,
  currentTermsAccepted: null,
  historicalProviderStillGoogleLinked: null,
  historicalCandidateDisabled: null,
}

/** @deprecated Informational only — compares to programmatic operator, not active grant. */
export function isFeedReaderDebugPilot(uid: string | null | undefined): boolean {
  return Boolean(uid && uid === FEED_READER_DEBUG_PILOT_UID)
}

/**
 * ?readerDebug=1 alone shows the SAFE public badge (no PII).
 * Previously required exact pilot UID — that made the panel invisible when
 * auth was missing / wrong account / still loading, hiding the root cause.
 */
export function shouldShowFeedReaderDebugPanel(opts: {
  readerDebugQuery: boolean
  uid?: string | null | undefined
}): boolean {
  return Boolean(opts.readerDebugQuery)
}

/** Map internal decideFeedReadAction → click-time badge labels. */
export function mapClickDebugFromDecision(input: {
  decision: FeedReaderLastReadDecision
}): {
  capabilityAtClick: FeedReaderClickCapabilityState
  readDecision: FeedReaderClickReadDecision
} {
  switch (input.decision) {
    case 'PENDING':
      return { capabilityAtClick: 'PENDING', readDecision: 'WAIT_FOR_CAPABILITY' }
    case 'OPEN_READER':
      return { capabilityAtClick: 'ENABLED', readDecision: 'OPEN_READER' }
    case 'ERROR_FALLBACK':
      return { capabilityAtClick: 'DISABLED', readDecision: 'ERROR_FALLBACK' }
    case 'CANONICAL_FALLBACK':
    default:
      return { capabilityAtClick: 'DISABLED', readDecision: 'CANONICAL_FALLBACK' }
  }
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

/** Compact safe badge fields — never includes UID/token/email. */
export function buildFeedReaderDebugBadgeLines(s: FeedReaderDebugSnapshot): string[] {
  return [
    `authLoading: ${s.authLoading}`,
    `authenticated: ${s.authenticated}`,
    `pilotMatch: ${s.uidMatch}`,
    `currentMatchesActiveFeedReaderGrant: ${s.currentMatchesActiveFeedReaderGrant ?? 'null'}`,
    `capabilityRequested: ${s.capabilityRequestStarted}`,
    `capabilityHTTPStatus: ${s.capabilityHTTPStatus ?? 'null'}`,
    `capabilityAuthenticated: ${s.capabilityAuthenticated ?? 'null'}`,
    `capabilityReady: ${s.capabilityReady}`,
    `capabilityEnabled: ${s.capabilityEnabled}`,
    `gestureHandlerAttached: ${s.gestureHandlerAttached}`,
    `currentUidPresent: ${s.currentUidPresent ?? 'null'}`,
    `historicalGoogleCandidateExists: ${s.historicalGoogleCandidateExists ?? 'null'}`,
    `historicalGoogleCandidateProvider: ${s.historicalGoogleCandidateProvider ?? 'null'}`,
    `currentMatchesHistoricalGooglePilot: ${s.currentMatchesHistoricalGooglePilot ?? 'null'}`,
    `currentMatchesProgrammaticOperator: ${s.currentMatchesProgrammaticOperator ?? 'null'}`,
    `currentProviderType: ${s.currentProviderType ?? 'null'}`,
    `currentFirebaseRecordValid: ${s.currentFirebaseRecordValid ?? 'null'}`,
    `currentDisabled: ${s.currentDisabled ?? 'null'}`,
    `currentProfileExists: ${s.currentProfileExists ?? 'null'}`,
    `currentTermsAccepted: ${s.currentTermsAccepted ?? 'null'}`,
    `historicalProviderStillGoogleLinked: ${s.historicalProviderStillGoogleLinked ?? 'null'}`,
    `historicalCandidateDisabled: ${s.historicalCandidateDisabled ?? 'null'}`,
    `lastReadClick: ${s.lastReadClick}`,
    `capabilityAtClick: ${s.capabilityAtClick ?? 'null'}`,
    `readDecision: ${s.readDecision ?? 'null'}`,
    `openReaderCalled: ${s.openReaderCalled}`,
    `readerItemSet: ${s.readerItemSet}`,
    `readerOverlayMounted: ${s.readerOverlayMounted}`,
    `routerPushCanonicalCalled: ${s.routerPushCanonicalCalled}`,
    `currentPath: ${s.currentPath ?? 'null'}`,
    `pointerDown: ${s.pointerDownReceived}`,
    `pointerMove: ${s.pointerMoveReceived}`,
    `pointerUp: ${s.pointerUpReceived}`,
    `pointerCancel: ${s.pointerCancelReceived}`,
    `gestureDecision: ${s.gestureDecision ?? 'null'}`,
  ]
}
