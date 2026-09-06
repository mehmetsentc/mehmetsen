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
 * Site chrome (Navbar + MobileNav) visibility.
 *
 * HOME / newspaper / canonical → visible (caller mounts normally)
 * /reels → always hidden
 * /feed-v2 + Reader closed → visible
 * /feed-v2 + Reader open/closing → hidden
 */
export function resolveSiteChromeVisible(opts: {
  pathname: string
  /** True while html/body has smart-feed-reader-open (OPEN / OPENING / CLOSING). */
  readerSurfaceActive: boolean
}): boolean {
  if (isReelsPathname(opts.pathname)) return false
  if (isFeedV2Pathname(opts.pathname) && opts.readerSurfaceActive) return false
  return true
}

/** Immersive full-bleed stage (reels layout tokens) — includes Feed V2 cards. */
export function isFeedImmersiveStage(pathname: string): boolean {
  return isReelsPathname(pathname) || isFeedV2Pathname(pathname)
}
