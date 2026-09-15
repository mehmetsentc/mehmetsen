/**
 * Feed V2 / Reader shell chrome authority.
 * Single source of truth for Navbar + MobileNav visibility on Feed surfaces.
 *
 * Global Nav V2 (default ON):
 * - MobileNav always off (header + side drawer authority)
 * - Top Navbar on /feed-v2 except while Reader surface is active
 *
 * Legacy / kill-switch (GLOBAL_NAV_V2=0):
 * - MobileNav on unless reels, reader, or admin
 */

import { ROUTES } from '@/constants/routes'
import { isGlobalNavV2EnabledClient } from '@/lib/feed/featureFlagClient'

export function isFeedV2Pathname(pathname: string): boolean {
  return (
    pathname === '/feed-v2' ||
    pathname.startsWith('/feed-v2/') ||
    pathname === '/feed-v3' ||
    pathname.startsWith('/feed-v3/')
  )
}

export function isFeedV3Pathname(pathname: string): boolean {
  return pathname === '/feed-v3' || pathname.startsWith('/feed-v3/')
}

export function isReelsPathname(pathname: string): boolean {
  return pathname === ROUTES.REELS || pathname.startsWith(`${ROUTES.REELS}/`)
}

export function isPublicVideoPathname(pathname: string): boolean {
  return pathname === ROUTES.VIDEO || pathname.startsWith(`${ROUTES.VIDEO}/`)
}

export function isImmersiveVideoPathname(pathname: string): boolean {
  return isReelsPathname(pathname) || isPublicVideoPathname(pathname)
}

/** Desktop /video uses the newspaper masthead; mobile/tablet keep the immersive player. */
export function isNewspaperDesktopVideo(pathname: string, isDesktop: boolean): boolean {
  return isDesktop && isPublicVideoPathname(pathname)
}

export function isGlobalNavV2Active(): boolean {
  return isGlobalNavV2EnabledClient()
}

/**
 * Top site Navbar visibility.
 *
 * Global Nav V2:
 *   HOME / newspaper / feed-v2 → visible
 *   Reader open on feed-v2 → hidden (Reader owns chrome)
 *   /reels → hidden
 *
 * Legacy (flag off):
 *   /feed-v2 → hidden (immersive without site header)
 */
export function resolveTopNavbarVisible(opts: {
  pathname: string
  readerSurfaceActive?: boolean
}): boolean {
  if (isImmersiveVideoPathname(opts.pathname)) return false
  if (isGlobalNavV2Active()) {
    if (isFeedV2Pathname(opts.pathname) && opts.readerSurfaceActive) return false
    return true
  }
  if (isFeedV2Pathname(opts.pathname)) return false
  return true
}

/**
 * Global MobileNav / bottom navbar visibility.
 *
 * Global Nav V2 → always hidden (no layout footprint; CSS belt also hides).
 * Legacy: hidden on reels/video, reader surface, and admin.
 */
export function resolveMobileNavVisible(opts: {
  pathname: string
  readerSurfaceActive?: boolean
}): boolean {
  if (isGlobalNavV2Active()) return false
  if (isImmersiveVideoPathname(opts.pathname)) return false
  if (opts.readerSurfaceActive) return false
  if (opts.pathname.startsWith('/admin')) return false
  return true
}

/**
 * Combined site chrome helper.
 * Global Nav V2: top Navbar is the chrome authority (MobileNav always off).
 * Legacy: both top + bottom must be visible.
 */
export function resolveSiteChromeVisible(opts: {
  pathname: string
  readerSurfaceActive: boolean
}): boolean {
  if (isGlobalNavV2Active()) {
    return resolveTopNavbarVisible(opts)
  }
  return (
    resolveTopNavbarVisible(opts) && resolveMobileNavVisible(opts)
  )
}

/** Immersive full-bleed stage (reels layout tokens) — includes Feed V2 cards. */
export function isFeedImmersiveStage(pathname: string): boolean {
  return isImmersiveVideoPathname(pathname) || isFeedV2Pathname(pathname)
}
