/**
 * Haberden çoklu görsel toplama + Meta'nın çekebileceği public URL hazırlama.
 *
 * Hybrid carousel:
 *   Slide 1  → markalı OG (/api/og/social/{id})
 *   Slide 2+ → orijinal görseller (gerekirse Sharp + Storage rehost)
 */
import {
  fetchImageAsJpegBuffer,
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

/**
 * Harici / hotlink riskli görseli JPEG'e çevirip Storage'a yükle.
 * Kendi CDN'imizdeyse URL'yi olduğu gibi bırak (hızlı yol).
 * Başarısızsa null — çağıran slide'ı atlar.
 */
export async function ensurePublicCarouselImageUrl(
  imageUrl: string,
  newsId: string,
  slideIndex: number
): Promise<string | null> {
  const url = normalizeAbsoluteImageUrl(imageUrl)
  if (!url || !isUsableImageUrl(url)) return null

  // Kendi hostlarımız Meta tarafından sorunsuz çekilir
  if (isOwnHostUrl(url) && !/\.webp(\?|$)/i.test(url)) {
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
 * Markalı OG + orijinal görsellerden publish payload alanlarını üret.
 * 1 görsel → single; 2+ → carousel (max 10). Bozuk secondary'ler atlanır.
 */
export async function buildSocialImagePayload(
  newsId: string,
  brandedOgUrl: string,
  data: Record<string, unknown>
): Promise<CarouselPayloadImages> {
  const originals = collectNewsImageUrls(data)

  if (originals.length < 2) {
    console.log(`[carouselImages] single — ${newsId} (${originals.length} kaynak görsel)`)
    return { imageUrl: brandedOgUrl, mode: 'single' }
  }

  // Slide 1 = branded OG; slide 2+ = orijinaller (max IG_CAROUSEL_MAX toplam)
  const secondaryCandidates = originals.slice(0, IG_CAROUSEL_MAX - 1)
  const prepared: string[] = [brandedOgUrl]

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
    return { imageUrl: brandedOgUrl, mode: 'single' }
  }

  console.log(
    `[carouselImages] carousel — ${newsId} (${prepared.length} slides, ${originals.length} kaynak)`
  )
  return {
    imageUrl: brandedOgUrl,
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
