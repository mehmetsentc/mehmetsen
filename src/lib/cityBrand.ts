/**
 * City-specific brand asset paths.
 *
 * Each city with a custom logo gets an entry here.
 * Assets live under public/brand/cities/<slug>/
 *
 * Header UI uses logo mark + HTML wordmark (CityBrandLockup) — never stack a
 * composite lockup PNG with separate text (causes ghost overlap).
 */

const CITY_LOGOS: Record<string, string> = {
  /** Official mark, white canvas removed */
  canakkale: '/brand/cities/canakkale/logo-mark-transparent-512.png',
  antalya: '/brand/cities/antalya/logo-mark-transparent-512.png',
}

const CITY_ICONS: Record<string, { icon32: string; icon192: string; icon512: string; apple: string; favicon: string }> = {
  canakkale: {
    icon32: '/brand/cities/canakkale/icon-32.png',
    icon192: '/brand/cities/canakkale/icon-192.png',
    icon512: '/brand/cities/canakkale/icon-512.png',
    apple: '/brand/cities/canakkale/apple-touch-icon.png',
    favicon: '/brand/cities/canakkale/favicon.ico',
  },
  antalya: {
    icon32: '/brand/cities/antalya/icon-32.png',
    icon192: '/brand/cities/antalya/icon-192.png',
    icon512: '/brand/cities/antalya/icon-512.png',
    apple: '/brand/cities/antalya/apple-touch-icon.png',
    favicon: '/brand/cities/antalya/favicon.ico',
  },
}

/**
 * Returns the header logo mark path for a city, or null for cities without a custom logo.
 */
export function getCityLogoPath(provinceSlug: string): string | null {
  return CITY_LOGOS[provinceSlug] ?? null
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
