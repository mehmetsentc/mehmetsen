/**
 * Haberden çoklu görsel toplama + Meta'nın çekebileceği public URL hazırlama.
 *
 * Hybrid carousel:
 *   Slide 1  → markalı OG (/api/og/social/{id})
 *   Slide 2+ → orijinal görseller (gerekirse Sharp + Storage rehost)
 */
import sharp from 'sharp'
import {
  fetchImageAsJpegBuffer,
  isMostlyNavyImage,
  isUsableImageUrl,
  normalizeAbsoluteImageUrl,
} from './ogImageEmbed'
import { uploadSocialImage } from './storageUploader'

/** Instagram carousel üst limiti */
export const IG_CAROUSEL_MAX = 10

const VIDEO_EXT = /\.(mp4|webm|mov|m3u8|mkv)(\?|$)/i
const OWN_HOST =
  /(^|\.)nahaber\.com$|(^|\.)onyeditivi\.com$|firebasestorage\.googleapis\.com|storage\.googleapis\.com/i

function isOwnHostUrl(url: string): boolean {
  try {
    return OWN_HOST.test(new URL(url).hostname)
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * OG self-fetch adayları: Vercel internal host önce (apex WAF/403 riskini keser),
 * sonra public www/apex.
 */
function ogFetchCandidates(brandedOgUrl: string): string[] {
  const out: string[] = []
  const push = (u: string) => {
    const t = u.trim()
    if (t && !out.includes(t)) out.push(t)
  }
  try {
    const u = new URL(brandedOgUrl)
    const vercelHost = process.env.VERCEL_URL?.replace(/^https?:\/\//, '').trim()
    if (vercelHost) {
      push(`https://${vercelHost}${u.pathname}${u.search}`)
    }
    push(brandedOgUrl)
    if (u.hostname === 'nahaber.com') {
      push(`https://www.nahaber.com${u.pathname}${u.search}`)
    } else if (u.hostname === 'www.nahaber.com') {
      push(`https://nahaber.com${u.pathname}${u.search}`)
    }
  } catch {
    push(brandedOgUrl)
  }
  return out
}

function addUrl(urls: string[], seen: Set<string>, raw: unknown): void {
  if (typeof raw !== 'string') return
  const url = normalizeAbsoluteImageUrl(raw)
  if (!url || !isUsableImageUrl(url)) return
  if (VIDEO_EXT.test(url)) return
  if (seen.has(url)) return
  seen.add(url)
  urls.push(url)
}

/**
 * Haber dokümanından 2–N benzersiz görsel URL'si topla (video atlanır).
 * Kaynaklar: cover alanları, mediaItems (image), additionalImages, galleryImages.
 */
export function collectNewsImageUrls(data: Record<string, unknown>): string[] {
  const urls: string[] = []
  const seen = new Set<string>()

  for (const key of ['thumbnail', 'coverImageUrl', 'imageUrl', 'featuredImage', 'image']) {
    addUrl(urls, seen, data[key])
  }

  if (Array.isArray(data.mediaItems)) {
    for (const item of data.mediaItems) {
      if (!item || typeof item !== 'object') continue
      const m = item as Record<string, unknown>
      const type = String(m.type ?? '').toLowerCase()
      if (type && type !== 'image') continue
      addUrl(urls, seen, m.url)
      if (typeof m.thumbnailUrl === 'string' && type === 'image') {
        // thumbnailUrl genelde aynı görsel — dedupe zaten filtreler
      }
    }
  }

  if (Array.isArray(data.additionalImages)) {
    for (const img of data.additionalImages) {
      if (typeof img === 'string') {
        addUrl(urls, seen, img)
      } else if (img && typeof img === 'object') {
        addUrl(urls, seen, (img as Record<string, unknown>).url)
      }
    }
  }

  if (Array.isArray(data.galleryImages)) {
    for (const g of data.galleryImages) {
      addUrl(urls, seen, g)
    }
  }

  return urls
}

/** Dinamik /api/og/* — 503 dönebilir; Meta'ya asla image_url olarak verilmez. */
export function isDynamicOgApiUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return /\/api\/og\/(social|story)\//i.test(u.pathname)
  } catch {
    return /\/api\/og\/(social|story)\//i.test(url)
  }
}

/**
 * Harici / hotlink riskli görseli JPEG'e çevirip Storage'a yükle.
 * Kendi CDN'imizdeyse URL'yi olduğu gibi bırak (hızlı yol) — forceRehost hariç.
 * Başarısızsa null — çağıran slide'ı atlar.
 */
export async function ensurePublicCarouselImageUrl(
  imageUrl: string,
  newsId: string,
  slideIndex: number,
  opts?: { forceRehost?: boolean },
): Promise<string | null> {
  const url = normalizeAbsoluteImageUrl(imageUrl)
  if (!url || !isUsableImageUrl(url)) return null
  if (isDynamicOgApiUrl(url)) return null

  // Kendi hostlarımız Meta tarafından sorunsuz çekilir (Meta publish öncesi forceRehost kullan)
  if (!opts?.forceRehost && isOwnHostUrl(url) && !/\.webp(\?|$)/i.test(url)) {
    return url
  }

  const jpeg = await fetchImageAsJpegBuffer(url, {
    maxWidth: 1440,
    maxHeight: 1440,
    quality: 85,
  })
  if (!jpeg) {
    console.warn(
      `[carouselImages] rehost failed for slide ${slideIndex} (${newsId}): ${url.slice(0, 100)}`
    )
    return null
  }

  const publicUrl = await uploadSocialImage(
    jpeg,
    newsId,
    `${newsId}-slide-${slideIndex}.jpg`
  )
  if (!publicUrl) return null
  return publicUrl
}

export interface CarouselPayloadImages {
  /** Tek görsel / slide 1 */
  imageUrl: string
  /** 2+ ise carousel listesi (slide1 + orijinaller), aksi halde undefined */
  imageUrls?: string[]
  mode: 'single' | 'carousel'
}

/**
 * Ham haber fotoğrafını JPEG olarak Storage'a sabitle (Meta image_url için).
 * Passthrough yok — kendi CDN URL'si bile indirilip yeniden yüklenir.
 */
async function forceRehostArticleImage(
  imageUrl: string,
  newsId: string,
  kind: 'post' | 'story',
): Promise<string | null> {
  const url = normalizeAbsoluteImageUrl(imageUrl)
  if (!url || !isUsableImageUrl(url) || isDynamicOgApiUrl(url)) return null

  const jpeg = await fetchImageAsJpegBuffer(url, {
    maxWidth: kind === 'story' ? 1080 : 1440,
    maxHeight: kind === 'story' ? 1920 : 1440,
    quality: 88,
  })
  if (!jpeg) {
    console.warn(
      `[carouselImages] force rehost download failed — ${newsId} (${kind}): ${url.slice(0, 100)}`,
    )
    return null
  }

  const uploaded = await uploadSocialImage(
    jpeg,
    newsId,
    `${newsId}-raw-${kind}.jpg`,
  )
  if (!uploaded) {
    console.warn(`[carouselImages] force rehost upload failed — ${newsId} (${kind})`)
    return null
  }
  return uploaded
}

/**
 * Markalı OG'yi üret → lacivert/boş kontrol → Storage'a sabitle.
 * Meta'ya dinamik /api/og URL vermek yerine statik JPEG verir (cold-start / CDN navy cache riskini keser).
 * Self-fetch: VERCEL_URL önce (public apex WAF 403 → raw fallback bug'ını önler).
 * OG 503/navy/timeout → ham foto zorla rehost (asla /api/og URL'si dönülmez — IG/FB kırılır, Threads TEXT'e düşer).
 */
export async function materializeBrandedOgForPublish(
  brandedOgUrl: string,
  newsId: string,
  fallbackImageUrl: string,
  kind: 'post' | 'story' = 'post',
): Promise<string> {
  let sawDefinitiveOgFailure = false
  const candidates = ogFetchCandidates(brandedOgUrl)

  for (const fetchUrl of candidates) {
    if (sawDefinitiveOgFailure) break
    for (let attempt = 0; attempt < 2; attempt++) {
      if (sawDefinitiveOgFailure) break
      try {
        const res = await fetch(fetchUrl, {
          signal: AbortSignal.timeout(25_000),
          redirect: 'follow',
          headers: {
            Accept: 'image/png,image/jpeg,image/*,*/*;q=0.8',
            'User-Agent':
              'Mozilla/5.0 (compatible; NaHaber-SocialBot/1.1; +https://www.nahaber.com)',
          },
          cache: 'no-store',
        })
        if (!res.ok) {
          console.warn(
            `[carouselImages] OG HTTP ${res.status} attempt ${attempt + 1} — ${newsId} (${kind}) host=${(() => {
              try {
                return new URL(fetchUrl).hostname
              } catch {
                return '?'
              }
            })()}`,
          )
          // 503 = kapak yok (kasıtlı); 403/401 = WAF — diğer host adayına geç
          if (res.status === 503 || res.status === 404 || res.status === 410) {
            sawDefinitiveOgFailure = true
            break
          }
          if (res.status === 403 || res.status === 401) {
            break // next candidate host
          }
          await sleep(600 * (attempt + 1))
          continue
        }
        const buf = Buffer.from(await res.arrayBuffer())
        if (buf.length < 1024) {
          console.warn(`[carouselImages] OG too small attempt ${attempt + 1} — ${newsId}`)
          await sleep(400 * (attempt + 1))
          continue
        }
        if (await isMostlyNavyImage(buf)) {
          console.warn(
            `[carouselImages] OG navy-dominant attempt ${attempt + 1} — ${newsId} (cover missing)`,
          )
          sawDefinitiveOgFailure = true
          break
        }

        const jpeg = await sharp(buf, { failOn: 'none' })
          .jpeg({ quality: 88, mozjpeg: true })
          .toBuffer()
        const uploaded = await uploadSocialImage(
          jpeg,
          newsId,
          `${newsId}-og-${kind}.jpg`,
        )
        if (uploaded) {
          console.log(
            `[carouselImages] materialized OG → storage — ${newsId} (${kind}) via=${(() => {
              try {
                return new URL(fetchUrl).hostname
              } catch {
                return 'ok'
              }
            })()}`,
          )
          return uploaded
        }
      } catch (err) {
        console.warn(
          `[carouselImages] OG materialize failed attempt ${attempt + 1} — ${newsId}:`,
          err instanceof Error ? err.message : err,
        )
        await sleep(600 * (attempt + 1))
      }
    }
  }

  const fallback = normalizeAbsoluteImageUrl(fallbackImageUrl)
  if (fallback && isUsableImageUrl(fallback) && !isDynamicOgApiUrl(fallback)) {
    const rehosted = await forceRehostArticleImage(fallback, newsId, kind)
    if (rehosted) {
      console.error(
        `[carouselImages] OG FAILED → RAW cover (no manşet overlay) — ${newsId} (${kind}); check OG self-fetch / cover embed`,
      )
      return rehosted
    }
    // Son çare: force rehost olmasa bile own-host passthrough (Meta çekebilir)
    const passthrough = await ensurePublicCarouselImageUrl(
      fallback,
      newsId,
      kind === 'story' ? 0 : 1,
    )
    if (passthrough && !isDynamicOgApiUrl(passthrough)) {
      console.error(
        `[carouselImages] OG FAILED → passthrough RAW cover — ${newsId} (${kind})`,
      )
      return passthrough
    }
  }

  console.error(
    `[carouselImages] no publishable image after OG+fallback — ${newsId} (${kind}); refusing dynamic OG URL`,
  )
  return ''
}

/**
 * Markalı OG + orijinal görsellerden publish payload alanlarını üret.
 * 1 görsel → single; 2+ → carousel (max 10). Bozuk secondary'ler atlanır.
 */
export async function buildSocialImagePayload(
  newsId: string,
  brandedOgUrl: string,
  data: Record<string, unknown>,
  opts?: { fallbackImageUrl?: string },
): Promise<CarouselPayloadImages> {
  const originals = collectNewsImageUrls(data)
  const fallbackImageUrl =
    opts?.fallbackImageUrl ||
    originals[0] ||
    ''

  const slide1 = await materializeBrandedOgForPublish(
    brandedOgUrl,
    newsId,
    fallbackImageUrl,
    'post',
  )

  if (!slide1) {
    console.error(`[carouselImages] no slide1 image — ${newsId}; publish will fail for IG`)
    return { imageUrl: '', mode: 'single' }
  }

  if (originals.length < 2) {
    console.log(`[carouselImages] single — ${newsId} (${originals.length} kaynak görsel)`)
    return { imageUrl: slide1, mode: 'single' }
  }

  // Slide 1 = branded OG; slide 2+ = orijinaller (max IG_CAROUSEL_MAX toplam)
  const secondaryCandidates = originals.slice(0, IG_CAROUSEL_MAX - 1)
  const prepared: string[] = [slide1]

  for (let i = 0; i < secondaryCandidates.length; i++) {
    if (prepared.length >= IG_CAROUSEL_MAX) break
    const publicUrl = await ensurePublicCarouselImageUrl(
      secondaryCandidates[i],
      newsId,
      i + 2
    )
    if (publicUrl) {
      prepared.push(publicUrl)
    } else {
      console.warn(
        `[carouselImages] secondary skip slide ${i + 2} — ${newsId}`
      )
    }
  }

  // En az 2 kalıcı URL yoksa tek görsele düş
  if (prepared.length < 2) {
    console.warn(
      `[carouselImages] carousel build failed → single fallback — ${newsId}`
    )
    return { imageUrl: slide1, mode: 'single' }
  }

  console.log(
    `[carouselImages] carousel — ${newsId} (${prepared.length} slides, ${originals.length} kaynak)`
  )
  return {
    imageUrl: slide1,
    imageUrls: prepared,
    mode: 'carousel',
  }
}

/** Payload'dan etkili carousel URL listesi (2+ ise). */
export function resolveCarouselUrls(payload: {
  imageUrl?: string
  imageUrls?: string[]
}): string[] | null {
  const list = (payload.imageUrls ?? [])
    .map((u) => (typeof u === 'string' ? u.trim() : ''))
    .filter((u) => u.length > 10)
  if (list.length >= 2) return list.slice(0, IG_CAROUSEL_MAX)
  return null
}
