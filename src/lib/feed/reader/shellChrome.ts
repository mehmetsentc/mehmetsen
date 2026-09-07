/**
 * Feed V2 / Reader shell chrome authority.
 * Single source of truth for Navbar + MobileNav visibility on Feed surfaces.
 */

import { ROUTES } from '@/constants/routes'

export function isFeedV2Pathname(pathname: string): boolean {
  return pathname === '/feed-v2' || pathname.startsWith('/feed-v2/')
}

export function isReelsPathname(pathname: string): boolean {
  return pathname === ROUTES.REELS || pathname.startsWith(`${ROUTES.REELS}/`)
}

/**
 * Top site Navbar visibility.
 *
 * HOME / newspaper / canonical → visible
 * /reels → hidden
 * /feed-v2 → hidden (immersive; Feed owns FeedV2CategoryNav)
 * Reader open on feed-v2 → already hidden via feed-v2 rule
 */
export function resolveTopNavbarVisible(opts: {
  pathname: string
  readerSurfaceActive?: boolean
}): boolean {
  void opts.readerSurfaceActive
  if (isReelsPathname(opts.pathname)) return false
  if (isFeedV2Pathname(opts.pathname)) return false
  return true
}

/**
 * Global MobileNav / bottom navbar visibility.
 *
 * MUST stay hidden for the entire /feed-v2 lifecycle:
 * Reader closed / open / closing / after return.
 */
export function resolveMobileNavVisible(opts: {
  pathname: string
  readerSurfaceActive?: boolean
}): boolean {
  void opts.readerSurfaceActive
  if (isReelsPathname(opts.pathname)) return false
  if (isFeedV2Pathname(opts.pathname)) return false
  return true
}

/**
 * Combined site chrome (top Navbar + MobileNav).
 * Prefer resolveTopNavbarVisible / resolveMobileNavVisible when they diverge.
 */
export function resolveSiteChromeVisible(opts: {
  pathname: string
  /** Kept for call-site compatibility; ignored for /feed-v2 (always immersive). */
  readerSurfaceActive: boolean
}): boolean {
  return (
    resolveTopNavbarVisible(opts) && resolveMobileNavVisible(opts)
  )
}

/** Immersive full-bleed stage (reels layout tokens) — includes Feed V2 cards. */
export function isFeedImmersiveStage(pathname: string): boolean {
  return isReelsPathname(pathname) || isFeedV2Pathname(pathname)
}
