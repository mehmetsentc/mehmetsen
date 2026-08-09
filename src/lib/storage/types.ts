/**
 * Storage provider abstraction — R2, Firebase Storage, or future backends.
 * Phase 2: R2 as primary, Firebase as read-only fallback for existing media.
 */

export interface StorageUploadOptions {
  contentType?: string
  cacheControl?: string
  metadata?: Record<string, string>
}

export interface StorageObject {
  key: string
  url: string
  size?: number
  contentType?: string
  lastModified?: Date
}

export interface StorageProvider {
  readonly name: string

  upload(
    key: string,
    body: Buffer | ReadableStream | Uint8Array,
    options?: StorageUploadOptions
  ): Promise<StorageObject>

  getPublicUrl(key: string): string

  delete(key: string): Promise<void>

  exists(key: string): Promise<boolean>
}

export type StorageBackend = 'r2' | 'firebase'
