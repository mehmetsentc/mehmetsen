/**
 * Feed V2 / Reader portrait-first preference.
 * Manifest orientation + optional Screen Orientation lock in installed PWA.
 * iPhone Safari cannot programmatically lock — report truthfully; CSS fallback only.
 */

export type FeedPortraitLockStatus =
  | 'locked'
  | 'unsupported'
  | 'failed'
  | 'skipped_browser'
  | 'skipped_ssr'

function isStandaloneDisplay(): boolean {
  try {
    if (typeof window === 'undefined') return false
    const mq = window.matchMedia?.('(display-mode: standalone)')
    if (mq?.matches) return true
    // iOS legacy
    const nav = window.navigator as Navigator & { standalone?: boolean }
    return Boolean(nav.standalone)
  } catch {
    return false
  }
}

/**
 * Attempt portrait lock only in installed PWA / fullscreen-capable contexts.
 * Never prompts repeatedly; never mutates history; never throws to callers.
 */
export async function tryLockFeedPortraitOrientation(): Promise<FeedPortraitLockStatus> {
  if (typeof window === 'undefined') return 'skipped_ssr'
  if (!isStandaloneDisplay()) return 'skipped_browser'

  const orientation = window.screen?.orientation as
    | (ScreenOrientation & { lock?: (t: string) => Promise<void> })
    | undefined
  if (!orientation || typeof orientation.lock !== 'function') {
    return 'unsupported'
  }

  try {
    await orientation.lock('portrait')
    return 'locked'
  } catch {
    try {
      await orientation.lock('portrait-primary')
      return 'locked'
    } catch {
      return 'failed'
    }
  }
}

export function isFeedPortraitStandaloneContext(): boolean {
  return isStandaloneDisplay()
}
