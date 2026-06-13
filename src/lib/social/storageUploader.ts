/**
 * Firebase Storage Uploader — sosyal medya görseli yükleme
 *
 * Buffer'ı Firebase Storage'a `social-images/` klasörüne yükler
 * ve Firebase Storage download URL'i döndürür.
 *
 * NOT: makePublic() yeni Firebase bucket'larında çalışmaz (uniform ACL).
 * Bunun yerine Firebase Storage Security Rules ile public read izni verilir
 * ve URL doğrudan firebasestorage.googleapis.com formatında oluşturulur.
 *
 * Env: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 */

import { getAdminStorage } from '@/lib/firebase/admin'

const FOLDER = 'social-images'

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

    // makePublic() yerine Firebase Storage REST URL kullan
    // Security Rule: match /social-images/{f} { allow read: if true; }
    const bucketName = bucket.name
    const encodedPath = encodeURIComponent(filename)
    const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media`

    console.log(`[storageUploader] uploaded ${filename} → ${publicUrl}`)
    return publicUrl
  } catch (err) {
    console.error('[storageUploader] upload error:', err)
    return null
  }
}
