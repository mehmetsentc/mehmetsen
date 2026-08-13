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

/** Onyeditivi post/story kartındaki lacivert (#0d2355) — foto yoksa bu ton hakim olur. */
const NAVY_RGB = { r: 13, g: 35, b: 85 }

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Üst bölgede lacivert (#0d2355) hakim mi?
 * Kapak gömülemediğinde OG kartı solid navy + metin üretir; Meta bunu "başarılı" sayıp yayınlar.
 */
export async function isMostlyNavyImage(
  buf: Buffer,
  opts?: { sampleTopRatio?: number; threshold?: number },
): Promise<boolean> {
  const sampleTopRatio = opts?.sampleTopRatio ?? 0.38
  const threshold = opts?.threshold ?? 0.82
  try {
    const meta = await sharp(buf, { failOn: 'none' }).metadata()
    const w = meta.width ?? 0
    const h = meta.height ?? 0
    if (w < 8 || h < 8) return true

    const sampleH = Math.max(8, Math.floor(h * sampleTopRatio))
    const { data, info } = await sharp(buf, { failOn: 'none' })
      .extract({ left: 0, top: 0, width: w, height: sampleH })
      .resize(48, 36, { fit: 'fill' })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })

    const channels = info.channels
    const pixels = info.width * info.height
    if (pixels <= 0) return true

    let navy = 0
    for (let i = 0; i < data.length; i += channels) {
      const dr = Math.abs(data[i] - NAVY_RGB.r)
      const dg = Math.abs(data[i + 1] - NAVY_RGB.g)
      const db = Math.abs(data[i + 2] - NAVY_RGB.b)
      if (dr <= 18 && dg <= 22 && db <= 28) navy++
    }
    return navy / pixels >= threshold
  } catch {
    return false
  }
}

/**
 * Aspect-ratio-aware image embedding for OG social images.
 *
 * ASPECT MISMATCH THRESHOLD: if the source aspect ratio differs from the
 * target by more than ~15%, a hard crop would destroy important content
 * (actor names at top, movie titles at bottom, etc.).
 *
 * Strategy:
 *  1. Similar aspects (within 15%) → `cover` + position heuristic. Safe
 *     to crop lightly; heads/sky preserved.
 *  2. Mismatched aspects (portrait poster → landscape zone, or extreme
 *     panoramas → square) → Instagram-style **contain + blurred background**:
 *       a. Canvas = target size filled with the source scaled to cover + heavy
 *          Gaussian blur + slight darken overlay.
 *       b. Foreground = source scaled with `contain` (entire image visible,
 *          centered on the canvas).
 *     Result: full poster visible (names + faces + title), frame still
 *     looks filled — no empty navy letterbox.
 *
 * Returns JPEG data URI — safe for <img src> in next/og Satori.
 */
export async function embedCoverTopImage(
  candidates: Array<string | undefined | null>,
  targetW: number,
  targetH: number,
  quality = 84,
  /** When true, always crop to fill — no contain+blur pillarbox fallback. */
  forceCover = false,
): Promise<string> {
  const targetAspect = targetW / targetH

  const seen = new Set<string>()
  const tried: string[] = []
  for (const c of candidates) {
    const url = normalizeAbsoluteImageUrl(c)
    if (!url || seen.has(url) || !isUsableImageUrl(url)) continue
    seen.add(url)
    tried.push(url.slice(0, 100))
    try {
      const buf = await downloadImageBuffer(url)
      if (!buf) continue

      const meta = await sharp(buf, { failOn: 'none' }).metadata()
      const srcW = meta.width ?? 1
      const srcH = meta.height ?? 1
      if (!meta.width || !meta.height) {
        console.warn(`[ogImageEmbed] no dimensions for ${url.slice(0, 100)}`)
        continue
      }
      const srcAspect = srcW / srcH

      const aspectRatio = srcAspect / targetAspect
      const needsContainBlur = !forceCover && (aspectRatio < 0.85 || aspectRatio > 1.18)

      let jpeg: Buffer

      if (needsContainBlur) {
        jpeg = await compositeContainBlur(buf, srcW, srcH, targetW, targetH, quality)
      } else {
        const position: string = srcAspect < targetAspect ? 'attention' : 'top'
        jpeg = await sharp(buf, { failOn: 'none' })
          .rotate()
          .resize(targetW, targetH, { fit: 'cover', position })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer()
      }

      return `data:image/jpeg;base64,${jpeg.toString('base64')}`
    } catch (err) {
      console.warn(
        `[ogImageEmbed] embed failed ${url.slice(0, 100)}:`,
        err instanceof Error ? err.message : err,
      )
      continue
    }
  }
  if (tried.length > 0) {
    console.warn(`[ogImageEmbed] all candidates failed (${tried.length}): ${tried.join(' | ')}`)
  } else {
    console.warn('[ogImageEmbed] no usable image candidates')
  }
  return ''
}

/**
 * Instagram-style contain + blurred background composite.
 * Background: source scaled to cover the target, heavily blurred + darkened.
 * Foreground: source scaled to contain (fully visible), centered.
 */
async function compositeContainBlur(
  buf: Buffer,
  srcW: number,
  srcH: number,
  targetW: number,
  targetH: number,
  quality: number,
): Promise<Buffer> {
  const bgBlur = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize(targetW, targetH, { fit: 'cover', position: 'centre' })
    .blur(40)
    .toBuffer()

  const darkOverlay = Buffer.from(
    `<svg width="${targetW}" height="${targetH}">
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.45)"/>
    </svg>`
  )

  const srcAspect = srcW / srcH
  const tgtAspect = targetW / targetH
  let fgW: number
  let fgH: number

  if (srcAspect > tgtAspect) {
    fgW = targetW
    fgH = Math.round(targetW / srcAspect)
  } else {
    fgH = targetH
    fgW = Math.round(targetH * srcAspect)
  }

  const fg = await sharp(buf, { failOn: 'none' })
    .rotate()
    .resize(fgW, fgH, { fit: 'fill' })
    .toBuffer()

  const fgLeft = Math.round((targetW - fgW) / 2)
  const fgTop = Math.round((targetH - fgH) / 2)

  return sharp(bgBlur)
    .composite([
      { input: darkOverlay, blend: 'over' },
      { input: fg, left: fgLeft, top: fgTop, blend: 'over' },
    ])
    .jpeg({ quality, mozjpeg: true })
    .toBuffer()
}

/** Own Firebase / GCS buckets — public fetch flaky olabilir; Admin SDK yedek. */
const OWN_STORAGE_HOST =
  /(^|\.)firebasestorage\.app$|(^|\.)googleapis\.com$|(^|\.)nahaber\.com$|(^|\.)onyeditivi\.com$/i

function parseOwnStorageObjectPath(url: string): { bucket?: string; objectPath: string } | null {
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()

    // https://firebasestorage.googleapis.com/v0/b/BUCKET/o/ENCODED?alt=media
    if (host === 'firebasestorage.googleapis.com') {
      const m = u.pathname.match(/^\/v0\/b\/([^/]+)\/o\/(.+)$/)
      if (!m) return null
      return { bucket: decodeURIComponent(m[1]), objectPath: decodeURIComponent(m[2]) }
    }

    // https://storage.googleapis.com/BUCKET/path/to/file.jpg
    if (host === 'storage.googleapis.com') {
      const parts = u.pathname.replace(/^\//, '').split('/')
      if (parts.length < 2) return null
      const bucket = parts[0]
      const objectPath = parts.slice(1).map((p) => decodeURIComponent(p)).join('/')
      if (!/nahaber|onyeditivi|firebasestorage\.app/i.test(bucket)) return null
      return { bucket, objectPath }
    }

    return null
  } catch {
    return null
  }
}

async function downloadViaAdminStorage(url: string): Promise<Buffer | null> {
  const parsed = parseOwnStorageObjectPath(url)
  if (!parsed) return null
  try {
    const { getAdminStorage } = await import('@/lib/firebase/admin')
    const storage = getAdminStorage()
    const bucket = parsed.bucket ? storage.bucket(parsed.bucket) : storage.bucket()
    const [buf] = await bucket.file(parsed.objectPath).download()
    if (!buf || buf.length < 64) return null
    console.log(`[ogImageEmbed] admin storage hit ${parsed.objectPath.slice(0, 80)} (${buf.length}b)`)
    return Buffer.from(buf)
  } catch (err) {
    console.warn(
      `[ogImageEmbed] admin storage miss ${url.slice(0, 100)}:`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

async function downloadImageBufferOnce(url: string, timeoutMs: number): Promise<Buffer | null> {
  try {
    const host = new URL(url).hostname
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
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
    return buf.length >= 64 ? buf : null
  } catch (err) {
    console.warn(
      `[ogImageEmbed] fetch failed ${url.slice(0, 100)}:`,
      err instanceof Error ? err.message : err,
    )
    return null
  }
}

/** Download image buffer with UA/Referer spoofing + retries + own-bucket Admin fallback. */
async function downloadImageBuffer(url: string): Promise<Buffer | null> {
  const timeouts = [12_000, 16_000, 20_000]
  for (let i = 0; i < timeouts.length; i++) {
    const buf = await downloadImageBufferOnce(url, timeouts[i])
    if (buf) return buf
    if (i < timeouts.length - 1) await sleep(250 * (i + 1))
  }

  try {
    const host = new URL(url).hostname
    if (OWN_STORAGE_HOST.test(host)) {
      const viaAdmin = await downloadViaAdminStorage(url)
      if (viaAdmin) return viaAdmin
    }
  } catch {
    /* ignore */
  }
  return null
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
    const buf = await downloadImageBuffer(url)
    if (!buf) return null

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
