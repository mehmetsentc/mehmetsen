import type { RemotePattern } from 'next/dist/shared/lib/image-config'

/**
 * Domain suffixes for Turkish / RSS news thumbnail CDNs (batch ingest sources).
 * Used by next/image remotePatterns and SafeNewsImage host checks.
 */
export const NEWS_IMAGE_DOMAIN_SUFFIXES = [
  'haberturk.com',
  'ntv.com.tr',
  'cnnturk.com',
  'aa.com.tr',
  'sozcu.com.tr',
  't24.com.tr',
  'gazeteduvar.com.tr',
  'trthaber.com',
  'iha.com.tr',
  'dha.com.tr',
  'hurriyet.com.tr',
  'milliyet.com.tr',
  'sabah.com.tr',
  'bbci.co.uk',
  'reuters.com',
  'reutersagency.com',
  'reutersmedia.net',
] as const

/** Explicit hostnames (including CDNs not covered by suffix rules). */
export const NEWS_IMAGE_HOSTS = [
  'im.haberturk.com',
  'i.haberturk.com',
  'www.haberturk.com',
  'images.ntv.com.tr',
  'www.ntv.com.tr',
  'cdn.cnnturk.com',
  'www.cnnturk.com',
  'ichef.bbci.co.uk',
  'www.aa.com.tr',
  'sozcu01.sozcu.com.tr',
  'www.sozcu.com.tr',
  'www.t24.com.tr',
  'www.gazeteduvar.com.tr',
  'www.trthaber.com',
  'www.iha.com.tr',
  'www.dha.com.tr',
] as const

/** True when hostname belongs to a known RSS/news image CDN. */
export function isKnownNewsImageHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if ((NEWS_IMAGE_HOSTS as readonly string[]).includes(h)) return true
  return NEWS_IMAGE_DOMAIN_SUFFIXES.some(
    (suffix) => h === suffix || h.endsWith(`.${suffix}`)
  )
}

function newsPattern(hostname: string): RemotePattern {
  return { protocol: 'https', hostname, pathname: '/**' }
}

/** Early connection hints for LCP image hosts (root layout <head>). */
export const NEWS_IMAGE_PRECONNECT_HOSTS = [
  'https://im.haberturk.com',
  'https://images.ntv.com.tr',
  'https://www.hurriyet.com.tr',
  'https://www.milliyet.com.tr',
  'https://www.aa.com.tr',
  'https://firebasestorage.googleapis.com',
] as const

/** Remote patterns for next/image — imported by next.config.ts */
export const NEWS_IMAGE_REMOTE_PATTERNS: RemotePattern[] = [
  // Explicit Habertürk CDN (reported in production)
  newsPattern('im.haberturk.com'),
  // Wildcard subdomains per news publisher (Next.js 15)
  ...NEWS_IMAGE_DOMAIN_SUFFIXES.map((suffix) => newsPattern(`**.${suffix}`)),
  // Apex domains
  ...NEWS_IMAGE_DOMAIN_SUFFIXES.map((suffix) => newsPattern(suffix)),
]
