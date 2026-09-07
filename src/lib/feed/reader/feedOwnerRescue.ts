/**
 * Session-only Feed owner rescue after Reader close.
 * If history.back() skips Feed → HOME, MainLayout restores /feed-v2.
 * No DB / analytics / grants.
 */

export const FEED_OWNER_RESCUE_KEY = 'nahaber.feedOwnerRescue.v1'

function storage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage
  } catch {
    return null
  }
}

/** Arm immediately before a history.back() that should land on Feed. */
export function armFeedOwnerRescue(): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.setItem(FEED_OWNER_RESCUE_KEY, '1')
  } catch {
    // private mode
  }
}

export function clearFeedOwnerRescue(): void {
  const ss = storage()
  if (!ss) return
  try {
    ss.removeItem(FEED_OWNER_RESCUE_KEY)
  } catch {
    // ignore
  }
}

/** Returns true once if rescue was armed — caller must navigate to /feed-v2. */
export function consumeFeedOwnerRescue(): boolean {
  const ss = storage()
  if (!ss) return false
  try {
    if (ss.getItem(FEED_OWNER_RESCUE_KEY) !== '1') return false
    ss.removeItem(FEED_OWNER_RESCUE_KEY)
    return true
  } catch {
    return false
  }
}
