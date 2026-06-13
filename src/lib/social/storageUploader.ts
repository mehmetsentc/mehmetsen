/**
 * Firebase Storage Uploader — sosyal medya görseli yükleme
 *
 * Buffer'ı Firebase Storage'a `social-images/` klasörüne yükler,
 * genel erişime açar ve public URL döndürür.
 *
 * Env: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 * Firebase Admin SDK kullanır (server-side only)
 */

import { getAdminStorage } from '@/lib/firebase/admin'

const FOLDER = 'social-images'

/**
 * Uploads a JPEG buffer to Firebase Storage.
 * @param buffer   JPEG image bytes
 * @param newsId   Firestore document ID (used as filename)
 * @returns Public download URL, or null on failure
 */
export async function uploadSocialImage(
  buffer: Buffer,
  newsId: string
): Promise<string | null> {
  try {
    const storage = getAdminStorage()
    const bucket  = storage.bucket()

    const filename = `${FOLDER}/${newsId}.jpg`
    const file     = bucket.file(filename)

    await file.save(buffer, {
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
      },
    })

    await file.makePublic()

    const bucketName = bucket.name
    const publicUrl  = `https://storage.googleapis.com/${bucketName}/${filename}`

    console.log(`[storageUploader] uploaded ${filename} → ${publicUrl}`)
    return publicUrl
  } catch (err) {
    console.error('[storageUploader] upload error:', err)
    return null
  }
}
