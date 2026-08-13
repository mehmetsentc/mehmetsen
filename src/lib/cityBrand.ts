/**
 * City-specific brand asset paths.
 *
 * Each city with a custom logo gets an entry here.
 * Assets live under public/brand/cities/<slug>/
 */

const CITY_LOGOS: Record<string, string> = {
  /** Official mark (favicon set from same source) */
  canakkale: '/brand/cities/canakkale/icon-192.png',
}

/** Equal-height logo + "City NaHaber" wordmark (transparent PNG). */
const CITY_HEADER_LOCKUPS: Record<string, { onBrand: string; default: string }> = {
  canakkale: {
    onBrand: '/brand/cities/canakkale/header-lockup-compact-transparent.png',
    default: '/brand/cities/canakkale/header-lockup-compact-light-transparent.png',
  },
}

const CITY_ICONS: Record<string, { icon32: string; icon192: string; icon512: string; apple: string; favicon: string }> = {
  canakkale: {
    icon32: '/brand/cities/canakkale/icon-32.png',
    icon192: '/brand/cities/canakkale/icon-192.png',
    icon512: '/brand/cities/canakkale/icon-512.png',
    apple: '/brand/cities/canakkale/apple-touch-icon.png',
    favicon: '/brand/cities/canakkale/favicon.ico',
  },
}

/**
 * Returns the header logo path for a city, or null for cities without a custom logo.
 */
export function getCityLogoPath(provinceSlug: string): string | null {
  return CITY_LOGOS[provinceSlug] ?? null
}

/**
 * Equal-height horizontal lockup (logo icon + city wordmark), or null.
 * @param variant onBrand = dark header (white city name); default = light surfaces
 */
export function getCityHeaderLockupPath(
  provinceSlug: string,
  variant: 'onBrand' | 'default' = 'onBrand'
): string | null {
  const entry = CITY_HEADER_LOCKUPS[provinceSlug]
  if (!entry) return null
  return entry[variant]
}

/**
 * Returns favicon/icon metadata icons array for a city tenant,
 * or null to fall back to national icons.
 */
export function getCityIconMetadata(provinceSlug: string) {
  const icons = CITY_ICONS[provinceSlug]
  if (!icons) return null

  return {
    icon: [
      { url: icons.favicon, sizes: 'any' },
      { url: icons.icon32, sizes: '32x32', type: 'image/png' },
      { url: icons.icon192, sizes: '192x192', type: 'image/png' },
      { url: icons.icon512, sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: icons.apple, sizes: '180x180', type: 'image/png' },
    ],
    shortcut: icons.favicon,
  }
}
