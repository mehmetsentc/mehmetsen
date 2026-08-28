/**
 * Phase P16 — Clean Image Gate
 *
 * Validates image candidates:
 * - Valid URL scheme (http/https)
 * - Rejects tracking pixels (1x1, pixel, beacon, analytics, stats)
 * - Rejects advertising banners / ad networks (doubleclick, pagead, ads, banner)
 * - Checks dimension bounds when width/height are available
 */

import type { ImageGateResult } from './editorialTypes'

const TRACKING_PIXEL_REGEX =
  /(?:pixel|tracking|beacon|analytics|spacer|transparent|1x1|\/stat(?:s|\.gif|\.png)?|\/count(?:er)?|\/tr\?|\/impression)/i

const AD_BANNER_REGEX =
  /(?:doubleclick|googlesyndication|pagead|adnxs|adroll|outbrain|taboola|\/ads\/|\/banners\/|\/reklam\/|ad-banner)/i

const SUSPICIOUS_EXTENSIONS = /\.(?:svg|ico|bmp|tiff)$/i

export function validateImageCandidate(
  url: string | null | undefined,
  meta?: { width?: number | null; height?: number | null; status?: string | null }
): ImageGateResult {
  if (!url || typeof url !== 'string') {
    return { valid: false, reason: 'MISSING_URL', url: null }
  }

  const trimmed = url.trim()
  if (!/^https?:\/\//i.test(trimmed)) {
    return { valid: false, reason: 'INVALID_URL_SCHEME', url: null }
  }

  if (TRACKING_PIXEL_REGEX.test(trimmed)) {
    return { valid: false, reason: 'TRACKING_PIXEL', url: null }
  }

  if (AD_BANNER_REGEX.test(trimmed)) {
    return { valid: false, reason: 'AD_BANNER', url: null }
  }

  if (SUSPICIOUS_EXTENSIONS.test(trimmed)) {
    return { valid: false, reason: 'UNSUPPORTED_EXTENSION', url: null }
  }

  if (meta) {
    if (meta.status === 'REJECTED') {
      return { valid: false, reason: 'EXPLICITLY_REJECTED', url: null }
    }
    const w = meta.width
    const h = meta.height
    if (typeof w === 'number' && typeof h === 'number' && w > 0 && h > 0) {
      if (w < 120 || h < 90) {
        return { valid: false, reason: 'DIMENSIONS_TOO_SMALL', url: null }
      }
      const aspect = w / h
      if (aspect < 0.35 || aspect > 3.5) {
        return { valid: false, reason: 'EXTREME_ASPECT_RATIO', url: null }
      }
    }
  }

  return { valid: true, reason: null, url: trimmed }
}

export function selectBestEditorialImage(
  candidates: Array<{ url: string | null | undefined; width?: number | null; height?: number | null; isPrimary?: boolean }>
): string | null {
  for (const c of candidates) {
    if (c.isPrimary && c.url) {
      const res = validateImageCandidate(c.url, c)
      if (res.valid && res.url) return res.url
    }
  }

  for (const c of candidates) {
    if (c.url) {
      const res = validateImageCandidate(c.url, c)
      if (res.valid && res.url) return res.url
    }
  }

  return null
}
