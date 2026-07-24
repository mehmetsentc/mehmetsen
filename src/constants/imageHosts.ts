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
  'hurimg.com',       // Hurriyet resim CDN (image.hurimg.com)
  'milliyet.com.tr',
  'milimaj.com',      // Milliyet resim CDN (image.milimaj.com)
  'sabah.com.tr',
  'tmgrup.com.tr',    // Sabah/Takvim grup CDN (iasbh, isbh)
  'dunya.com',        // Dünya gazetesi
  'teimg.com',        // istanbulgazetesi CDN
  'bbci.co.uk',
  'reuters.com',
  'reutersagency.com',
  'reutersmedia.net',
  'ankahaber.net',    // ANKA Haber Ajansı görselleri
  // Kripto
  'coindesk.com',
  'cointelegraph.com',
  'kriptokoin.com',
  'btchaber.com',
  // Finans / Ekonomi
  'bloomberght.com',
  'ekonomim.com',
  // Diğer ulusal gazeteler
  'cumhuriyet.com.tr',
  'posta.com.tr',
  'ensonhaber.com',
  'mynet.com',
] as const

/** Explicit hostnames (including CDNs not covered by suffix rules). */
export const NEWS_IMAGE_HOSTS = [
  // Firebase / GCS — admin uploads and public bucket URLs
  'firebasestorage.googleapis.com',
  'storage.googleapis.com',
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

/** Remote patterns for next/image — imported by next.config.ts */
export const NEWS_IMAGE_REMOTE_PATTERNS: RemotePattern[] = [
  // Explicit Habertürk CDN (reported in production)
  newsPattern('im.haberturk.com'),
  // YouTube thumbnail API — video reels önerileri için
  newsPattern('img.youtube.com'),
  newsPattern('i.ytimg.com'),
  // Wildcard subdomains per news publisher — covers www., cdn., img. etc.
  // Apex patterns kaldırıldı: Next.js limit 50, haber CDN'leri her zaman subdomain kullanır.
  ...NEWS_IMAGE_DOMAIN_SUFFIXES.map((suffix) => newsPattern(`**.${suffix}`)),
]
