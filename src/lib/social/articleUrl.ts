/**
 * Public article URLs for social share / OG — never draft `taslak-*` slugs.
 */
import { ROUTES } from '@/constants/routes'
import { getSiteUrl } from '@/lib/seo'
import { isPlaceholderDraftSlug, urlContainsDraftSlug } from '@/lib/newsSlug'

function normalizePublicHost(url: string): string {
  return url
    .replace('nahaber.vercel.app', 'www.nahaber.com')
    .replace('https://nahaber.com', 'https://www.nahaber.com')
}

/**
 * Build the public article URL used in Threads / IG / FB / X captions.
 * Returns null when only a draft placeholder slug/url is available — callers
 * must upgrade the slug or skip social publish.
 */
export function buildPublicArticleUrl(
  id: string,
  data: Record<string, unknown>,
  origin?: string
): string | null {
  const base = (origin ?? getSiteUrl()).replace(/\/$/, '')
  const rawUrl = typeof data.url === 'string' ? data.url.trim() : ''
  const slug = typeof data.slug === 'string' ? data.slug.trim() : ''

  if (rawUrl && !urlContainsDraftSlug(rawUrl)) {
    return normalizePublicHost(rawUrl)
  }

  if (slug && !isPlaceholderDraftSlug(slug)) {
    return `${base}${ROUTES.NEWS_DETAIL(slug)}`
  }

  // No shareable public news path — do not fall back to /haber/taslak-*
  return null
}

/** Assert a share URL is safe for public social posts. */
export function isPublicShareArticleUrl(url: string | null | undefined): boolean {
  const u = (url ?? '').trim()
  if (!u) return false
  if (urlContainsDraftSlug(u)) return false
  if (/taslak/i.test(u)) return false
  return true
}
