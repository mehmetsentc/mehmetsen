/**
 * next/og (Satori) birçok CDN görselini yükleyemez:
 *  - .jpg URL'si aslında image/webp döner (Cumhuriyet vb.)
 *  - hotlink / Referer koruması
 *  - uzantısız CDN path'leri
 *
 * Çözüm: sunucuda indir → Sharp ile JPEG'e çevir → data URI ver.
 */
import sharp from 'sharp'

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const UNSUPPORTED_EXT = /\.(svg|bmp|tiff?)(\?|$)/i

export function normalizeAbsoluteImageUrl(url: string | undefined | null): string {
  const raw = (url ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('/')) return `https://www.nahaber.com${raw}`
  if (!/^https?:\/\//i.test(raw)) return ''
  return raw
}

export function isUsableImageUrl(url: string | undefined | null): url is string {
  const u = normalizeAbsoluteImageUrl(url)
  if (!u) return false
  if (u.endsWith('/') || u.endsWith('-') || u.endsWith('_')) return false
  if (UNSUPPORTED_EXT.test(u)) return false
  return true
}

/** Aday listesinden ilk geçerli URL (uzantı zorunlu değil). */
export function pickBestImageUrl(candidates: Array<string | undefined | null>): string {
  for (const c of candidates) {
    if (isUsableImageUrl(c)) return normalizeAbsoluteImageUrl(c)
  }
  return ''
}

/**
 * Görseli indir → Sharp ile tam olarak targetW×targetH boyutuna akıllı cover-crop.
 *
 * Strateji:
 * - Kaynak landscape (veya kareye yakın) → position:'top' — kafa/gökyüzü korunur.
 * - Kaynak portrait (hedeften dikeyse) → position:'attention' — Sharp entropy/saliency
 *   tabanlı odak bulur; yüzler, kontrastlı alanlar çerçevede kalır.
 *   Bu sayede dikey fotoğrafların üst boşluk şeridi (tavan vb.) değil,
 *   ortadaki konu (kişi) görünür.
 *
 * Sonuç JPEG data URI — doğrudan <img src> olarak kullanılır.
 */
export async function embedCoverTopImage(
  candidates: Array<string | undefined | null>,
  targetW: number,
  targetH: number,
  quality = 84,
): Promise<string> {
  const targetAspect = targetW / targetH

  const seen = new Set<string>()
  for (const c of candidates) {
    const url = normalizeAbsoluteImageUrl(c)
    if (!url || seen.has(url) || !isUsableImageUrl(url)) continue
    seen.add(url)
    try {
      const host = new URL(url).hostname
      const res = await fetch(url, {
        signal: AbortSignal.timeout(12_000),
        redirect: 'follow',
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8',
          Referer: refererFor(host),
        },
      })
      if (!res.ok) continue
      const buf = Buffer.from(await res.arrayBuffer())
      if (buf.length < 64) continue

      const img = sharp(buf, { failOn: 'none' }).rotate()
      const meta = await img.metadata()
      const srcW = meta.width ?? 1
      const srcH = meta.height ?? 1
      const srcAspect = srcW / srcH

      // Portrait source into landscape target → vertical crop needed → use attention
      // Landscape/square source → horizontal crop → top preserves heads
      const position: string =
        srcAspect < targetAspect * 0.85 ? 'attention' : 'top'

      const jpeg = await img
        .resize(targetW, targetH, { fit: 'cover', position })
        .jpeg({ quality, mozjpeg: true })
        .toBuffer()

      return `data:image/jpeg;base64,${jpeg.toString('base64')}`
    } catch {
      continue
    }
  }
  return ''
}

function refererFor(hostname: string): string {
  // Haber siteleri genelde kendi origin'ini Referer ister
  const host = hostname.toLowerCase()
  if (host.includes('cumhuriyet')) return 'https://www.cumhuriyet.com.tr/'
  if (host.includes('hurriyet')) return 'https://www.hurriyet.com.tr/'
  if (host.includes('milliyet')) return 'https://www.milliyet.com.tr/'
  if (host.includes('sabah')) return 'https://www.sabah.com.tr/'
  if (host.includes('sozcu')) return 'https://www.sozcu.com.tr/'
  if (host.includes('ntv')) return 'https://www.ntv.com.tr/'
  if (host.includes('aa.com.tr') || host.includes('anadolu')) return 'https://www.aa.com.tr/'
  if (host.includes('firebasestorage') || host.includes('googleapis')) return 'https://www.nahaber.com/'
  return `https://${hostname}/`
}

/**
 * Görseli indirip JPEG buffer döner. Başarısızsa null.
 * Hotlink / WebP / Referer korumalı CDN'ler için UA+Referer kullanır.
 */
export async function fetchImageAsJpegBuffer(
  imageUrl: string,
  opts?: { maxWidth?: number; maxHeight?: number; quality?: number },
): Promise<Buffer | null> {
  const url = normalizeAbsoluteImageUrl(imageUrl)
  if (!url) return null

  const maxWidth = opts?.maxWidth ?? 1200
  const maxHeight = opts?.maxHeight ?? 1600
  const quality = opts?.quality ?? 82

  try {
    const host = new URL(url).hostname
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      redirect: 'follow',
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'image/avif,image/webp,image/apng,image/jpeg,image/png,image/*,*/*;q=0.8',
        Referer: refererFor(host),
      },
    })
    if (!res.ok) {
      console.warn(`[ogImageEmbed] HTTP ${res.status} for ${url.slice(0, 120)}`)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 64) return null

    return await sharp(buf, { failOn: 'none' })
      .rotate()
      .resize({
        width: maxWidth,
        height: maxHeight,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer()
  } catch (err) {
    console.warn('[ogImageEmbed] failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/**
 * Görseli indirip JPEG data URI döner. Başarısızsa null.
 * next/og <img src> için güvenli format.
 */
export async function embedOgImageDataUri(
  imageUrl: string,
  opts?: { maxWidth?: number; maxHeight?: number; quality?: number },
): Promise<string | null> {
  const jpeg = await fetchImageAsJpegBuffer(imageUrl, opts)
  if (!jpeg) return null
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`
}

/** Adayları sırayla dene; ilk başarılı data URI. */
export async function embedBestOgImage(
  candidates: Array<string | undefined | null>,
  opts?: { maxWidth?: number; maxHeight?: number; quality?: number },
): Promise<string> {
  const seen = new Set<string>()
  for (const c of candidates) {
    const url = normalizeAbsoluteImageUrl(c)
    if (!url || seen.has(url) || !isUsableImageUrl(url)) continue
    seen.add(url)
    const data = await embedOgImageDataUri(url, opts)
    if (data) return data
  }
  return ''
}
