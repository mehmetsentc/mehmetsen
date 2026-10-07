/**
 * Feed 2 — full-screen ad when a story opens ("haber açılışı reklamı").
 * Decided 2026-10-07 (Mehmet): "Dengeli" frequency, never on every story:
 *   - the first 2 story opens of a session are ad-free;
 *   - then at least 4 story opens between two ads;
 *   - at least 3 minutes between two ads;
 *   - at most 5 ads per session.
 * The close (X) appears after 5 seconds. Shown only when an approved ad exists
 * (local ad of the story's il first, else national; otherwise nothing).
 * Pure decision + small sessionStorage wrapper (per tab session, fail-open to "no ad").
 */
export const READER_INTERSTITIAL_SLOT_ID = 'feed-reader-interstitial'

export const READER_INTERSTITIAL_POLICY = {
  freeOpens: 2,
  minOpensBetween: 4,
  minMsBetween: 3 * 60 * 1000,
  maxPerSession: 5,
  closeAfterSeconds: 5,
} as const

export interface InterstitialSessionState {
  /** Story opens counted this session. */
  opens: number
  /** Ads actually shown this session. */
  shown: number
  /** `opens` value when the last ad was shown (null = never). */
  lastShownAtOpen: number | null
  /** Epoch ms of the last ad (null = never). */
  lastShownAtMs: number | null
}

export const EMPTY_INTERSTITIAL_STATE: InterstitialSessionState = {
  opens: 0,
  shown: 0,
  lastShownAtOpen: null,
  lastShownAtMs: null,
}

/** Called for the N-th story open (state.opens already includes it). */
export function shouldOfferInterstitial(
  state: InterstitialSessionState,
  nowMs: number,
  policy = READER_INTERSTITIAL_POLICY
): boolean {
  if (state.opens <= policy.freeOpens) return false
  if (state.shown >= policy.maxPerSession) return false
  if (state.lastShownAtOpen !== null && state.opens - state.lastShownAtOpen < policy.minOpensBetween) return false
  if (state.lastShownAtMs !== null && nowMs - state.lastShownAtMs < policy.minMsBetween) return false
  return true
}

export function recordOpen(state: InterstitialSessionState): InterstitialSessionState {
  return { ...state, opens: state.opens + 1 }
}

export function recordShown(state: InterstitialSessionState, nowMs: number): InterstitialSessionState {
  return { ...state, shown: state.shown + 1, lastShownAtOpen: state.opens, lastShownAtMs: nowMs }
}

const STORAGE_KEY = 'nahaber.readerInterstitial.v1'

export function loadInterstitialState(): InterstitialSessionState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...EMPTY_INTERSTITIAL_STATE }
    const p = JSON.parse(raw) as Partial<InterstitialSessionState>
    return {
      opens: Number.isFinite(p.opens) ? Number(p.opens) : 0,
      shown: Number.isFinite(p.shown) ? Number(p.shown) : 0,
      lastShownAtOpen: typeof p.lastShownAtOpen === 'number' ? p.lastShownAtOpen : null,
      lastShownAtMs: typeof p.lastShownAtMs === 'number' ? p.lastShownAtMs : null,
    }
  } catch {
    return { ...EMPTY_INTERSTITIAL_STATE }
  }
}

export function saveInterstitialState(state: InterstitialSessionState): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    /* private mode / storage blocked — fine */
  }
}
