import { createHash } from 'node:crypto'

const OG_SITE = 'https://nahaber.com'

export interface OgCacheVersionInput {
  title?: string
  socialHeadline?: string
  socialStorySummary?: string
  imageUrl?: string
  updatedAt?: number | string | null
}

/** Stable cache-bust param from content — changes only when headline/image/summary changes. */
export function buildOgCacheVersion(fields: OgCacheVersionInput): string {
  const headline = (fields.socialHeadline || fields.title || '').trim()
  const summary = (fields.socialStorySummary || '').trim().slice(0, 80)
  const image = (fields.imageUrl || '').trim()
  const updated = fields.updatedAt != null ? String(fields.updatedAt) : ''
  const payload = `${headline}|${summary}|${image}|${updated}`
  return createHash('sha256').update(payload).digest('hex').slice(0, 12)
}

export function buildOgStoryUrl(id: string, fields: OgCacheVersionInput): string {
  const v = buildOgCacheVersion(fields)
  return `${OG_SITE}/api/og/story/${id}?v=${v}`
}

export function buildOgSocialUrl(id: string, fields: OgCacheVersionInput): string {
  const v = buildOgCacheVersion(fields)
  return `${OG_SITE}/api/og/social/${id}?v=${v}`
}

export const OG_IMAGE_CACHE_CONTROL =
  'public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400'
