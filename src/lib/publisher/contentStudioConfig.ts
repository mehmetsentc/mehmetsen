/**
 * Central Publisher Content Studio (P7B) limits — no magic numbers in UI.
 */

export const PUBLISHER_CONTENT_AUTOSAVE_DEBOUNCE_MS = 1200

export function getPublisherMediaMaxBytes(): number {
  const raw = Number(process.env.PUBLISHER_MEDIA_MAX_BYTES)
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 50 * 1024 * 1024)
  return 15 * 1024 * 1024
}

/** Allowed upload MIME types — SVG intentionally excluded. */
export const PUBLISHER_MEDIA_ALLOWED_MIME = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const

export type PublisherMediaMime = (typeof PUBLISHER_MEDIA_ALLOWED_MIME)[number]

export function isAllowedPublisherMediaMime(mime: string): mime is PublisherMediaMime {
  return (PUBLISHER_MEDIA_ALLOWED_MIME as readonly string[]).includes(mime)
}

export const PUBLISHER_MEDIA_EXT_BY_MIME: Record<PublisherMediaMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
}

/** Max dual-write heal attempts before reconciler skips. */
export function getPublisherPublicationMaxAttempts(): number {
  const raw = Number(process.env.PUBLISHER_PUBLICATION_MAX_ATTEMPTS)
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 50)
  return 8
}

/** Fresh PUBLISHING leases newer than this are not touched by reconcile. */
export function getPublisherPublicationStaleLeaseMs(): number {
  const raw = Number(process.env.PUBLISHER_PUBLICATION_STALE_LEASE_MS)
  if (Number.isFinite(raw) && raw > 0) return Math.min(raw, 60 * 60 * 1000)
  return 5 * 60 * 1000
}

export const PUBLISHER_AUTOSAVE_RATE_LIMIT = { limit: 60, windowMs: 60_000 }
export const PUBLISHER_MEDIA_UPLOAD_RATE_LIMIT = { limit: 20, windowMs: 60_000 }
