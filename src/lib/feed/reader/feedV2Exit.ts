/**
 * Feed V2 exit navigation — Level 2 → Level 1 (site surface).
 * Never uses history.back() (avoids Reader-era HOME double-pop).
 * Entry origin is remembered when navigating into /feed-v2 from site chrome.
 */

import { ROUTES } from '@/constants/routes'

export const FEED_V2_ENTRY_ORIGIN_KEY = 'nahaber.feedV2.entryOrigin.v1'

/** Safe fallback when no trustworthy same-app origin exists. */
export const FEED_V2_EXIT_FALLBACK = ROUTES.FEED

function sessionStore(): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return window.sessionStorage
  } catch {
    return null
  }
}

function isFeedV2Path(pathname: string): boolean {
  return pathname === '/feed-v2' || pathname.startsWith('/feed-v2/')
}

/** Internal paths we refuse to treat as exit destinations. */
function isUnsafeExitTarget(pathname: string): boolean {
  if (!pathname.startsWith('/')) return true
  if (isFeedV2Path(pathname)) return true
  if (pathname.startsWith('/login') || pathname.startsWith('/register')) return true
  if (pathname.startsWith('/api/')) return true
  return false
}

/**
 * Call from Zap / sidebar / desktop nav BEFORE leaving the current surface for Feed V2.
 * Ignores already-on-feed-v2 and unsafe paths.
 */
export function rememberFeedV2EntryOrigin(pathname: string | null | undefined): void {
  if (!pathname || isUnsafeExitTarget(pathname)) return
  try {
    sessionStore()?.setItem(
      FEED_V2_ENTRY_ORIGIN_KEY,
      JSON.stringify({ pathname, ts: Date.now() })
    )
  } catch {
    // private mode / quota
  }
}

export function peekFeedV2EntryOrigin(): string | null {
  try {
    const raw = sessionStore()?.getItem(FEED_V2_ENTRY_ORIGIN_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { pathname?: string }
    if (typeof parsed.pathname !== 'string' || isUnsafeExitTarget(parsed.pathname)) {
      return null
    }
    return parsed.pathname
  } catch {
    return null
  }
}

/**
 * One-shot capture from same-origin document.referrer when origin was not
 * stamped by chrome (soft-nav without remember, or cold edge cases).
 * Does not overwrite an existing stamp.
 */
export function captureFeedV2EntryFromReferrer(): void {
  if (peekFeedV2EntryOrigin()) return
  try {
    if (typeof document === 'undefined' || !document.referrer) return
    const ref = new URL(document.referrer)
    if (ref.origin !== window.location.origin) return
    rememberFeedV2EntryOrigin(ref.pathname)
  } catch {
    // ignore
  }
}

/**
 * Explicit push destination for Feed V2 exit control.
 * Never returns a Feed V2 URL; never suggests history.back().
 */
export function resolveFeedV2ExitHref(): string {
  const origin = peekFeedV2EntryOrigin()
  if (origin) return origin
  return FEED_V2_EXIT_FALLBACK
}
