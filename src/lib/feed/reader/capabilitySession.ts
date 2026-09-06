/**
 * Feed Reader open-session capability latch.
 * Distinguishes authoritative ENABLED/DENIED from transient fetch errors.
 * Browser-session / Feed-mount only — not persisted to DB.
 */

export type FeedReaderCapabilityAuthority =
  | 'unknown'
  | 'pending'
  | 'enabled'
  | 'denied'
  | 'transient_error'

export type FeedReaderCapabilitySession = {
  /** Authoritative ENABLED received while authenticated in this Feed mount. */
  confirmedEnabled: boolean
  /** Authoritative DENIED (ready + disabled, not a transport error). */
  confirmedDenied: boolean
  /** Last settle was a transport/parse error. */
  transientError: boolean
  authority: FeedReaderCapabilityAuthority
}

export function createFeedReaderCapabilitySession(): FeedReaderCapabilitySession {
  return {
    confirmedEnabled: false,
    confirmedDenied: false,
    transientError: false,
    authority: 'unknown',
  }
}

/**
 * Apply a settled capability result into the session latch.
 * Transport errors never clear a prior confirmedEnabled.
 */
export function settleFeedReaderCapabilitySession(
  prev: FeedReaderCapabilitySession,
  opts: {
    authLoading: boolean
    authenticated: boolean
    ready: boolean
    enabled: boolean
    transportError: boolean
  }
): FeedReaderCapabilitySession {
  if (opts.authLoading && !prev.confirmedEnabled) {
    return { ...prev, transientError: false, authority: 'pending' }
  }
  if (opts.transportError) {
    if (prev.confirmedEnabled) {
      return {
        ...prev,
        transientError: true,
        authority: 'enabled',
      }
    }
    return {
      ...prev,
      transientError: true,
      authority: 'transient_error',
    }
  }
  if (!opts.ready) {
    return {
      ...prev,
      transientError: false,
      authority: prev.confirmedEnabled ? 'enabled' : 'pending',
    }
  }
  if (opts.enabled) {
    return {
      confirmedEnabled: true,
      confirmedDenied: false,
      transientError: false,
      authority: 'enabled',
    }
  }
  // Ready + disabled: authoritative denial (or guest/non-pilot).
  return {
    confirmedEnabled: false,
    confirmedDenied: Boolean(opts.authenticated) || prev.confirmedDenied,
    transientError: false,
    authority: 'denied',
  }
}

/** Effective enabled flag for gesture attachment + open decisions. */
export function sessionReaderOpenEligible(session: FeedReaderCapabilitySession): boolean {
  return session.confirmedEnabled || session.authority === 'enabled'
}
