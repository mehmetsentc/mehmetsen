import { createHash } from 'node:crypto'
import { decodeHtmlEntities } from './htmlEntities'
import { isTrackingParam, normalizeArticleUrl } from '../url/normalize'

/** Gallery floor. Missing dimensions alone never reject. */
export const MIN_GALLERY_WIDTH = 250
export const MIN_GALLERY_HEIGHT = 150
/** Strong banner signal when combined with another cue, or when height is also tiny. */
export const MAX_BANNER_ASPECT = 4
/** Default extras besides the primary. Galleries may exceed this cap. */
export const MAX_DEFAULT_EXTRAS = 8
export const MAX_GALLERY_EXTRAS = 16
export const GALLERY_FIGURE_THRESHOLD = 4
/** @deprecated use MAX_DEFAULT_EXTRAS + 1; kept as the non-gallery accepted cap. */
export const MAX_EDITORIAL_IMAGES_PER_ARTICLE = MAX_DEFAULT_EXTRAS + 1

const CDN_SIZE_PARAMS = new Set([
  'w',
  'h',
  'width',
  'height',
  'maxwidth',
  'maxheight',
  'minwidth',
  'minheight',
  'imwidth',
  'imheight',
  'imgwidth',
  'imgheight',
  'resize',
  'fit',
  'crop',
  'quality',
  'q',
  'dpr',
  'auto',
  'fm',
  'format',
  'cs',
  'sharp',
  'blur',
  'sat',
  'ixlib',
  'ixid',
  's',
  'rs',
  'rw',
  'rh',
  'c',
  'f',
  'n',
  'zoom',
])

const WP_SIZE_SUFFIX = /-(?:\d{2,5}x\d{2,5}|scaled|rotated)(?=\.(?:jpe?g|png|webp|gif|avif)$)/i

export function decodeImageUrl(raw: string): string {
  return decodeHtmlEntities(raw.trim()).replace(/\\u0026/gi, '&')
}

export function normalizeImageUrl(raw: string, baseUrl?: string): string | null {
  const decoded = decodeImageUrl(raw)
  if (!decoded) return null
  const normalized = normalizeArticleUrl(decoded, baseUrl)
  if (!normalized) return null
  try {
    const parsed = new URL(normalized)
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')
    if (parsed.protocol === 'http:') parsed.protocol = 'https:'
    const kept = [...parsed.searchParams.entries()]
      .filter(([key]) => !isTrackingParam(key))
      .sort(([a], [b]) => a.localeCompare(b))
    parsed.search = ''
    for (const [key, value] of kept) parsed.searchParams.append(key, value)
    return parsed.toString()
  } catch {
    return normalized
  }
}

/** Size-stripped identity so CDN/srcset variants collapse to one row. */
export function imageVariantKey(normalizedUrl: string): string {
  try {
    const parsed = new URL(normalizedUrl)
    parsed.hash = ''
    parsed.hostname = parsed.hostname.toLowerCase().replace(/^www\./, '')
    parsed.pathname = parsed.pathname.replace(WP_SIZE_SUFFIX, '')
    parsed.pathname = parsed.pathname.replace(/\/(?:w|h|width|height)_\d+\//gi, '/')
    parsed.pathname = parsed.pathname.replace(/\/cdn-cgi\/image\/[^/]+\//i, '/')
    const kept = [...parsed.searchParams.entries()].filter(([key]) => !CDN_SIZE_PARAMS.has(key.toLowerCase()))
    parsed.search = ''
    for (const [key, value] of kept) parsed.searchParams.append(key, value)
    return parsed.toString()
  } catch {
    return normalizedUrl
  }
}

export function cdnQualityRank(url: string, width: number | null, height: number | null): number {
  const area = (width || 0) * (height || 0)
  let fromParams = 0
  try {
    const parsed = new URL(url)
    const w =
      Number(parsed.searchParams.get('w') || parsed.searchParams.get('width') || parsed.searchParams.get('imwidth') || 0) ||
      0
    const h =
      Number(parsed.searchParams.get('h') || parsed.searchParams.get('height') || parsed.searchParams.get('imheight') || 0) ||
      0
    fromParams = w * (h || 1)
    const wp = parsed.pathname.match(/-(\d{2,5})x(\d{2,5})(?=\.)/i)
    if (wp) fromParams = Math.max(fromParams, Number(wp[1]) * Number(wp[2]))
  } catch {
    /* ignore */
  }
  return Math.max(area, fromParams, width || 0)
}

export function urlContentHash(normalizedUrl: string): string {
  return createHash('sha256').update(normalizedUrl).digest('hex')
}
