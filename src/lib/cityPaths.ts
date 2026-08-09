/** Normalize pathname for city tenant routing (middleware rewrites + aliases). */
export function normalizeCityPath(pathname: string): string {
  if (pathname.startsWith('/city-site')) {
    const rest = pathname.slice('/city-site'.length)
    return rest || '/'
  }
  return pathname
}

/** Whether a city section tab (Ana Feed, Etkinlik, Spor, İlçeler) is active. */
export function isCitySectionActive(pathname: string, href: string): boolean {
  const path = normalizeCityPath(pathname)
  if (href === '/') {
    return path === '/' || path === '/feed' || path === '/yerel'
  }
  return path === href || path.startsWith(`${href}/`)
}
