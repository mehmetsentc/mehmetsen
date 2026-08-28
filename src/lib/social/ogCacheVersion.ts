import { createHash } from 'node:crypto'

const OG_SITE = 'https://nahaber.com'

/** Bump when OG renderer behavior changes so Meta/CDN stale navy cards are busted. */
const OG_RENDER_REV = '10'

export interface OgCacheVersionInput {
  title?: string
  socialHeadline?: string
  socialStorySummary?: string
  imageUrl?: string
  categoryId?: string
  isBreaking?: boolean
  updatedAt?: number | string | null
}

/** Stable cache-bust param from content — changes only when headline/image/summary changes. */
export function buildOgCacheVersion(fields: OgCacheVersionInput): string {
  const headline = (fields.socialHeadline || fields.title || '').trim()
  const summary = (fields.socialStorySummary || '').trim().slice(0, 80)
  const image = (fields.imageUrl || '').trim()
  const updated = fields.updatedAt != null ? String(fields.updatedAt) : ''
  const payload = `${OG_RENDER_REV}|${headline}|${summary}|${image}|${updated}`
  return createHash('sha256').update(payload).digest('hex').slice(0, 12)
}

export function buildOgStoryUrl(id: string, fields: OgCacheVersionInput): string {
  const v = buildOgCacheVersion(fields)
  const params = new URLSearchParams()
  params.set('v', v)
  if (fields.title) params.set('title', fields.title.slice(0, 160))
  if (fields.socialStorySummary) params.set('summary', fields.socialStorySummary.slice(0, 240))
  if (fields.imageUrl) params.set('image', fields.imageUrl)
  if (fields.categoryId) params.set('category', fields.categoryId)
  if (fields.isBreaking) params.set('breaking', '1')
  return `${OG_SITE}/api/og/story/${id}?${params.toString()}`
}

export function buildOgSocialUrl(id: string, fields: OgCacheVersionInput): string {
  const v = buildOgCacheVersion(fields)
  const params = new URLSearchParams()
  params.set('v', v)
  if (fields.title) params.set('title', fields.title.slice(0, 160))
  if (fields.imageUrl) params.set('image', fields.imageUrl)
  if (fields.categoryId) params.set('category', fields.categoryId)
  if (fields.isBreaking) params.set('breaking', '1')
  return `${OG_SITE}/api/og/social/${id}?${params.toString()}`
}

export const OG_IMAGE_CACHE_CONTROL =
  'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
