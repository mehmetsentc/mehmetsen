/** Normalize pathname for city tenant routing (middleware rewrites + aliases). */
export function normalizeCityPath(pathname: string): string {
  const raw = pathname.trim() || '/'
  if (raw === '/city-site' || raw.startsWith('/city-site/')) {
    const rest = raw.slice('/city-site'.length)
    return rest || '/'
  }
  return raw
}

/** Whether a city section tab (Ana Feed, Etkinlik, Spor, İlçeler) is active. */
export function isCitySectionActive(pathname: string, href: string): boolean {
  const path = normalizeCityPath(pathname)
  if (href === '/') {
    return (
      path === '/' ||
      path === '/feed' ||
      path === '/yerel' ||
      path === '/feed-v2' ||
      path.startsWith('/feed-v2/')
    )
  }
  if (href === '/feed-v2') {
    return path === '/' || path === '/feed-v2' || path.startsWith('/feed-v2/')
  }
  return path === href || path.startsWith(`${href}/`)
}

/** Main city feed surfaces where dynamic category nav is shown. */
export function isCityFeedPath(pathname: string | null | undefined): boolean {
  const path = normalizeCityPath(pathname || '/')
  return (
    path === '/' ||
    path === '/feed' ||
    path === '/yerel' ||
    path === '/feed-v2' ||
    path.startsWith('/feed-v2/')
  )
}

/** City Feed 2 occupies `/` and `/feed-v2` on mobile — desktop keeps newspaper home. */
export function isCityImmersivePath(pathname: string): boolean {
  return isCityFeedPath(pathname)
}
