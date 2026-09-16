import { ROUTES } from '@/constants/routes'

/**
 * Profil dock / sidebar — yalnızca yayıncı üyeleri.
 * Tek yayın → public publisher profile; birden fazla → studio picker.
 */
export function resolvePublisherProfileHref(
  publishers: Array<{ slug: string }> | null | undefined
): string | null {
  if (!publishers || publishers.length === 0) return null
  if (publishers.length === 1) {
    const slug = publishers[0]?.slug?.trim()
    return slug ? ROUTES.PUBLISHER(slug) : null
  }
  return ROUTES.PUBLISHER_STUDIO.ROOT
}

export function isPublisherProfilePath(
  pathname: string,
  publishers?: Array<{ slug: string }> | null
): boolean {
  if (pathname.startsWith('/profile/') || pathname.startsWith('/u/')) return true
  if (pathname.startsWith('/publisher-studio')) return true
  if (!pathname.startsWith('/publisher/')) return false
  if (!publishers || publishers.length === 0) return false
  return publishers.some((p) => {
    const slug = p.slug?.trim()
    if (!slug) return false
    const href = ROUTES.PUBLISHER(slug)
    return pathname === href || pathname.startsWith(`${href}/`)
  })
}
