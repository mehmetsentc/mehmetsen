/**
 * Same-origin resize URLs for publisher CDNs that are not in next/image's
 * remotePatterns. The phone should never download a 1–2 MB PNG for a 163 px card.
 */

const MIN_WIDTH = 64
const MAX_WIDTH = 1200

export function clampImageWidth(width: number): number {
  if (!Number.isFinite(width)) return 640
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)))
}

/**
 * CSS sizes hint → proxy width.
 * A `100vw` slot is the phone width: 828 for the LCP hero, 480 otherwise.
 * The desktop px in the same string must not inflate the download.
 * A fixed card (`163px`) stays at 2× so it stays sharp.
 */
export function widthHintFromSizes(sizes: unknown, priority: boolean): number {
  if (typeof sizes === 'string') {
    if (sizes.includes('100vw') || sizes.includes('vw')) {
      return priority ? 750 : 480
    }
    const px = [...sizes.matchAll(/(\d+)px/g)].map((m) => Number(m[1]))
    if (px.length > 0) {
      return clampImageWidth(Math.max(...px) * 2)
    }
  }
  return priority ? 750 : 480
}

/**
 * Public http(s) image URL. Rejects credentials, loopback, private ranges,
 * and our own host so the proxy cannot be aimed at itself.
 */
export function parsePublicImageUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (url.username || url.password) return null

  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
    return null
  }
  if (
    host === 'metadata.google.internal' ||
    host === 'metadata.goog' ||
    host.endsWith('.internal') ||
    host === 'nahaber.com' ||
    host.endsWith('.nahaber.com')
  ) {
    return null
  }

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const a = Number(ipv4[1])
    const b = Number(ipv4[2])
    const parts = [a, b, Number(ipv4[3]), Number(ipv4[4])]
    if (parts.some((n) => n > 255)) return null
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224
    ) {
      return null
    }
  }

  if (host.includes(':') || host === '::1') return null
  return url
}

export function newsImageProxyPath(src: string, width: number): string {
  const w = clampImageWidth(width)
  return `/api/img?url=${encodeURIComponent(src)}&w=${w}&q=45`
}
