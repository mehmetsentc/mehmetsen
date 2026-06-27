import { NextResponse } from 'next/server'
import { verifyCmsToken } from '@/lib/cmsAuthServer'
import { getAdminStorage } from '@/lib/firebase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/admin/media/import
 * Body: { url: string }
 *
 * Dış URL'den medya (görsel veya video) indirir, Firebase Storage'a yükler
 * ve public download URL döndürür.
 *
 * YouTube URL'leri bu endpoint'e gelmez — client tarafında embed URL'ye
 * dönüştürülür, storage'a yüklenmez.
 */
export async function POST(request: Request) {
  const auth = await verifyCmsToken(request, 'news:edit')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let url: string
  try {
    const body = await request.json() as { url?: string }
    url = (body.url ?? '').trim()
    if (!url) throw new Error('empty')
    new URL(url) // validate
  } catch {
    return NextResponse.json({ error: 'Geçersiz URL' }, { status: 400 })
  }

  // Dosyayı indir
  let response: Response
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'NaHaber-Bot/1.0' },
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'İndirme hatası'
    return NextResponse.json({ error: `URL indirilemedi: ${msg}` }, { status: 422 })
  }

  const contentType = response.headers.get('content-type') ?? ''
  const isImage = contentType.startsWith('image/')
  const isVideo = contentType.startsWith('video/')

  // URL'den uzantı tahmin et
  const urlPath = new URL(url).pathname
  const ext = urlPath.match(/\.(jpe?g|png|gif|webp|mp4|webm)$/i)?.[1]?.toLowerCase() ?? (
    isImage ? 'jpg' : isVideo ? 'mp4' : 'bin'
  )

  if (!isImage && !isVideo) {
    // content-type güvenilir değilse uzantıya bak
    const imgExts = ['jpg', 'jpeg', 'png', 'gif', 'webp']
    const vidExts = ['mp4', 'webm']
    if (!imgExts.includes(ext) && !vidExts.includes(ext)) {
      return NextResponse.json(
        { error: 'Desteklenmeyen medya türü. Yalnızca görsel veya video URL kabul edilir.' },
        { status: 415 }
      )
    }
  }

  // 50 MB limit
  const MAX = 50 * 1024 * 1024
  const buffer = await response.arrayBuffer()
  if (buffer.byteLength > MAX) {
    return NextResponse.json({ error: 'Dosya boyutu 50 MB sınırını aşıyor' }, { status: 413 })
  }

  const finalContentType = isImage
    ? (contentType || `image/${ext}`)
    : isVideo
      ? (contentType || `video/${ext}`)
      : ext.match(/^(jpe?g|png|gif|webp)$/) ? `image/${ext}` : `video/${ext}`

  const mediaType = finalContentType.startsWith('video/') ? 'video' : 'image'
  const folder = mediaType === 'video' ? 'news-videos' : 'news-images'
  const fileName = `${Date.now()}_imported.${ext}`
  const storagePath = `${folder}/admin/${fileName}`

  // Firebase Admin Storage'a yükle
  try {
    const adminStorage = getAdminStorage()
    const bucketName =
      process.env.FIREBASE_STORAGE_BUCKET?.trim() ||
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim()
    const bucket = adminStorage.bucket(bucketName)
    const file = bucket.file(storagePath)

    await file.save(Buffer.from(buffer), {
      contentType: finalContentType,
      metadata: { cacheControl: 'public, max-age=31536000' },
      public: true,
    })

    // Public URL
    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`

    return NextResponse.json({ url: publicUrl, type: mediaType })
  } catch (err) {
    console.error('[media/import] Storage upload failed:', err)
    return NextResponse.json({ error: 'Storage yükleme başarısız' }, { status: 500 })
  }
}
