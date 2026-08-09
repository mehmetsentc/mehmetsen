/**
 * Firebase Storage provider — READ-ONLY fallback for existing media.
 * Used to resolve existing image URLs; new uploads go to R2.
 *
 * Firebase Storage URLs are in the format:
 *   https://firebasestorage.googleapis.com/v0/b/{bucket}/o/{path}?alt=media&token={token}
 *
 * This provider does NOT upload — it's purely for URL resolution of legacy media.
 */

import type { StorageProvider, StorageObject, StorageUploadOptions } from './types'

const FIREBASE_STORAGE_BUCKET = process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || ''

export class FirebaseStorageProvider implements StorageProvider {
  readonly name = 'firebase' as const

  async upload(
    _key: string,
    _body: Buffer | ReadableStream | Uint8Array,
    _options?: StorageUploadOptions
  ): Promise<StorageObject> {
    throw new Error(
      'FirebaseStorageProvider is read-only. Use R2 for new uploads.'
    )
  }

  getPublicUrl(key: string): string {
    if (!FIREBASE_STORAGE_BUCKET) {
      return key
    }
    const encodedPath = encodeURIComponent(key)
    return `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodedPath}?alt=media`
  }

  async delete(_key: string): Promise<void> {
    throw new Error(
      'FirebaseStorageProvider does not support deletion. Legacy media is preserved.'
    )
  }

  async exists(_key: string): Promise<boolean> {
    return false
  }
}
