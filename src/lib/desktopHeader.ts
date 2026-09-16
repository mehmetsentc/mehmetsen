/**
 * Public gazette chrome (`data-desktop-header="newspaper"`) is an html-level
 * theme. Routes that are not the newspaper (admin, auth, settings, video)
 * must keep it off so paper-lock tokens do not leak.
 */
export function hasDesktopWebHeader(pathname: string): boolean {
  if (pathname === '/reels' || pathname === '/video' || pathname.startsWith('/video/')) {
    return false
  }
  if (pathname.startsWith('/messages')) return false
  if (pathname.startsWith('/admin')) return false
  if (pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/onboarding')) {
    return false
  }
  if (pathname.startsWith('/saved') || pathname.startsWith('/settings')) return false
  if (pathname.startsWith('/notifications')) return false
  return true
}
