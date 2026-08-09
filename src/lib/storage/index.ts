/**
 * Unified media storage — R2 primary, Firebase fallback for legacy URLs.
 *
 * Usage:
 *   import { getStorage, getMediaUrl } from '@/lib/storage'
 *
 *   // Upload new media to R2
 *   const storage = getStorage()
 *   const result = await storage.upload('news/cover/abc.webp', buffer, { contentType: 'image/webp' })
 *
 *   // Resolve any media URL (handles Firebase legacy, R2, and external)
 *   const url = getMediaUrl(item.coverImageUrl)
 */

export type { StorageProvider, StorageObject, StorageUploadOptions, StorageBackend } from './types'
export { R2StorageProvider } from './r2Client'
export { FirebaseStorageProvider } from './firebaseStorage'

import type { StorageProvider } from './types'
import { R2StorageProvider } from './r2Client'
import { FirebaseStorageProvider } from './firebaseStorage'

let _storage: StorageProvider | null = null

/**
 * Get the active storage provider.
 * Returns R2 if configured, otherwise Firebase (read-only).
 */
export function getStorage(): StorageProvider {
  if (_storage) return _storage

  if (process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID) {
    _storage = new R2StorageProvider()
  } else {
    _storage = new FirebaseStorageProvider()
  }

  return _storage
}

/**
 * Is R2 storage configured and available for uploads?
 */
export function isR2Configured(): boolean {
  return !!(process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY)
}

const FIREBASE_URL_PATTERN = /^https:\/\/firebasestorage\.googleapis\.com\//
const R2_DEV_PATTERN = /\.r2\.dev\//
const HTTP_PATTERN = /^https?:\/\//

/**
 * Resolve a media URL to the best publicly accessible form.
 * - Full HTTP(S) URLs pass through unchanged (Firebase, R2, external CDNs)
 * - Bare keys (e.g. "news/cover/abc.webp") are resolved via the active storage provider
 * - Null/undefined → undefined
 */
export function getMediaUrl(urlOrKey: string | null | undefined): string | undefined {
  if (!urlOrKey) return undefined

  const trimmed = urlOrKey.trim()
  if (!trimmed) return undefined

  if (HTTP_PATTERN.test(trimmed)) return trimmed

  const storage = getStorage()
  return storage.getPublicUrl(trimmed)
}

/**
 * Detect the storage backend for an existing URL (for analytics/migration tracking).
 */
export function detectStorageBackend(url: string): 'firebase' | 'r2' | 'external' | 'unknown' {
  if (FIREBASE_URL_PATTERN.test(url)) return 'firebase'
  if (R2_DEV_PATTERN.test(url)) return 'r2'

  const r2PublicUrl = process.env.R2_PUBLIC_URL
  if (r2PublicUrl && url.startsWith(r2PublicUrl)) return 'r2'

  if (HTTP_PATTERN.test(url)) return 'external'
  return 'unknown'
}

/**
 * Generate an R2 object key for news media.
 * Format: news/{type}/{newsId}/{filename}
 */
export function buildNewsMediaKey(
  newsId: string,
  type: 'cover' | 'thumbnail' | 'gallery',
  filename: string
): string {
  return `news/${type}/${newsId}/${filename}`
}
