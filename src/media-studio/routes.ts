/** Admin routes for the Media Studio shell. No public surface. */
export const MEDIA_STUDIO_ROUTES = [
  '/admin/media-studio',
  '/admin/media-studio/jobs',
  '/admin/media-studio/library',
  '/admin/media-studio/failed',
  '/admin/media-studio/settings',
] as const

export function mediaStudioWorkspacePath(id: string): string {
  return `/admin/media-studio/workspaces/${encodeURIComponent(id)}`
}

export const STUDIO_NAV = [
  { href: '/admin/media-studio', label: 'Yeni İndirme', exact: true, primary: true },
  { href: '/admin/media-studio/jobs', label: 'İndirmeler', exact: false, primary: false },
  { href: '/admin/media-studio/library', label: 'Kütüphane', exact: false, primary: false },
  { href: '/admin/media-studio/failed', label: 'Başarısız', exact: false, primary: false },
  { href: '/admin/media-studio/settings', label: 'Ayarlar', exact: false, primary: false },
] as const

export function isStudioNavActive(pathname: string, href: string, exact: boolean): boolean {
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(`${href}/`)
}
