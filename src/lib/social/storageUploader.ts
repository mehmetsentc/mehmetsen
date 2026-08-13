/**
 * Firebase Storage Uploader — sosyal medya görseli yükleme
 *
 * Buffer'ı Firebase Storage'a `social-images/` klasörüne yükler
 * ve Meta'nın anonim çekebileceği public URL döndürür.
 *
 * NOT: makePublic() yeni Firebase bucket'larında (uniform bucket-level access)
 * çalışmaz. Public erişim `storage.rules` → `match /social-images/** { allow read: if true; }`
 * ile sağlanır. URL doğrulanır; 403 ise uzun ömürlü signed URL'ye düşülür.
 *
 * Env: NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
 */

import { randomUUID } from 'crypto'
import { getAdminStorage } from '@/lib/firebase/admin'

const FOLDER = 'social-images'

async function urlLooksLikePublicImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
      headers: {
        Range: 'bytes=0-2047',
        'User-Agent':
          'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      },
    })
    if (!(res.ok || res.status === 206)) return false
    const ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (ctype.includes('application/json') || ctype.includes('text/html')) return false
    const buf = Buffer.from(await res.arrayBuffer())
    // JPEG SOI or PNG signature
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true
    if (
      buf.length >= 8 &&
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    ) {
      return true
    }
    return ctype.startsWith('image/') && buf.length > 64
  } catch {
    return false
  }
}

/**
 * @param filenameHint — opsiyonel; verilmezse `{newsId}.jpg`.
 *   Carousel slide'lar için örn. `{newsId}-slide-2.jpg`
 */
export async function uploadSocialImage(
  buffer: Buffer,
  newsId: string,
  filenameHint?: string
): Promise<string | null> {
  try {
    const storage = getAdminStorage()
    const bucket = storage.bucket()

    const safeHint = filenameHint
      ?.replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/\.+/g, '.')
      .slice(0, 120)
    const filename = `${FOLDER}/${safeHint || `${newsId}.jpg`}`
    const file = bucket.file(filename)
    const downloadToken = randomUUID()

    await file.save(buffer, {
      metadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000',
        metadata: {
          firebaseStorageDownloadTokens: downloadToken,
        },
      },
      resumable: false,
    })

    const bucketName = bucket.name
    const encodedPath = encodeURIComponent(filename)
    const publicUrl =
      `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}` +
      `?alt=media&token=${downloadToken}`

    if (await urlLooksLikePublicImage(publicUrl)) {
      console.log(`[storageUploader] uploaded ${filename} → public OK`)
      return publicUrl
    }

    // Rules henüz deploy edilmemiş / ACL kapalıysa: Meta için signed URL
    console.warn(
      `[storageUploader] public URL not readable (rules/ACL?) — signed fallback — ${filename}`,
    )
    const [signedUrl] = await file.getSignedUrl({
      action: 'read',
      // Meta container create anında çeker; retry penceresi için 30 gün
      expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
    })
    if (await urlLooksLikePublicImage(signedUrl)) {
      console.log(`[storageUploader] uploaded ${filename} → signed OK`)
      return signedUrl
    }

    console.error(`[storageUploader] uploaded but unreachable by HTTP — ${filename}`)
    return null
  } catch (err) {
    console.error('[storageUploader] upload error:', err)
    return null
  }
}
