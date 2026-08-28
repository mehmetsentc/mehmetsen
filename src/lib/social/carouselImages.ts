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
import { createStoryCardSharp, createPostCardSharp } from './imageOverlay'

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
 * OG self-fetch adayları: Vercel internal host, configured app URL, apex/www.
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
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || '').replace(/^https?:\/\//, '').trim()
    if (appUrl) {
      push(`https://${appUrl}${u.pathname}${u.search}`)
    }
    const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.replace(/^https?:\/\//, '').trim()
    if (vercelProd) {
      push(`https://${vercelProd}${u.pathname}${u.search}`)
    }
    push(brandedOgUrl)
    if (u.hostname === 'nahaber.com') {
      push(`https://www.nahaber.com${u.pathname}${u.search}`)
    } else if (u.hostname === 'www.nahaber.com') {
      push(`https://nahaber.com${u.pathname}${u.search}`)
    }
    // Local dev / test fallback
    if (process.env.PORT || process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
      const port = process.env.PORT || '3000'
      push(`http://127.0.0.1:${port}${u.pathname}${u.search}`)
      push(`http://localhost:${port}${u.pathname}${u.search}`)
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

export interface MaterializeBrandedOgContext {
  title?: string
  summary?: string
  categoryId?: string
  isBreaking?: boolean
}

/**
 * Markalı OG'yi üret → lacivert/boş kontrol → Storage'a sabitle.
 * Meta'ya dinamik /api/og URL vermek yerine statik JPEG verir (cold-start / CDN navy cache riskini keser).
 * Self-fetch: VERCEL_URL / NEXT_PUBLIC_APP_URL önce.
 * OG HTTP self-fetch başarısız olursa doğrudan yerel Sharp+SVG kart oluşturucuyu devreye sokar (ASLA ham kapak dönmez).
 */
export async function materializeBrandedOgForPublish(
  brandedOgUrl: string,
  newsId: string,
  fallbackImageUrl: string,
  kind: 'post' | 'story' = 'post',
  context?: MaterializeBrandedOgContext,
): Promise<string> {
  let sawDefinitiveOgFailure = false
  const candidates = ogFetchCandidates(brandedOgUrl)

  // 1. Try HTTP OG generation endpoint candidates
  for (const fetchUrl of candidates) {
    if (sawDefinitiveOgFailure) break
    for (let attempt = 0; attempt < 2; attempt++) {
      if (sawDefinitiveOgFailure) break
      try {
        const res = await fetch(fetchUrl, {
          signal: AbortSignal.timeout(20_000),
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
          if (res.status === 503 || res.status === 404 || res.status === 410) {
            sawDefinitiveOgFailure = true
            break
          }
          if (res.status === 403 || res.status === 401) {
            break // next candidate host
          }
          await sleep(500 * (attempt + 1))
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
          `[carouselImages] OG materialize HTTP failed attempt ${attempt + 1} — ${newsId}:`,
          err instanceof Error ? err.message : err,
        )
        await sleep(500 * (attempt + 1))
      }
    }
  }

  // 2. HTTP self-fetch failed or returned navy: DIRECT IN-PROCESS SHARP COMPOSITOR
  // Extracts metadata from URL search params, context, or Firestore
  let title = context?.title || ''
  let summary = context?.summary || ''
  let categoryId = context?.categoryId || 'gundem'
  let isBreaking = context?.isBreaking || false

  try {
    const parsedUrl = new URL(brandedOgUrl)
    if (!title) title = parsedUrl.searchParams.get('title') || ''
    if (!summary) summary = parsedUrl.searchParams.get('summary') || ''
    if (parsedUrl.searchParams.get('category')) categoryId = parsedUrl.searchParams.get('category')!
    if (parsedUrl.searchParams.get('breaking') === '1') isBreaking = true
  } catch {
    // ignore URL parse errors
  }

  // If still missing title, attempt Firestore lookup via Admin SDK
  if (!title && newsId) {
    try {
      const { getAdminFirestore } = await import('@/lib/firebase/admin')
      const { Collections } = await import('@/lib/firebase/collections')
      const snap = await getAdminFirestore().collection(Collections.NEWS).doc(newsId).get()
      if (snap.exists) {
        const d = snap.data() as Record<string, unknown>
        title = String(d.socialHeadline || d.title || '')
        summary = String(d.socialStorySummary || d.summary || d.spot || '')
        categoryId = String(d.categoryId || d.category || categoryId)
        isBreaking = d.isBreaking === true || categoryId === 'son-dakika'
      }
    } catch (err) {
      console.warn(`[carouselImages] direct firestore context fetch failed for ${newsId}:`, err)
    }
  }

  const fallback = normalizeAbsoluteImageUrl(fallbackImageUrl)

  if (fallback && isUsableImageUrl(fallback) && !isDynamicOgApiUrl(fallback)) {
    try {
      console.log(`[carouselImages] creating in-process Sharp card overlay — ${newsId} (${kind})`)
      let cardBuffer: Buffer

      if (kind === 'story') {
        cardBuffer = await createStoryCardSharp({
          imageSource: fallback,
          title: title || 'NaHaber',
          summary,
          categoryId,
          isBreaking,
        })
      } else {
        cardBuffer = await createPostCardSharp({
          imageSource: fallback,
          title: title || 'NaHaber',
          categoryId,
          isBreaking,
        })
      }

      if (cardBuffer && cardBuffer.length > 2048) {
        const uploaded = await uploadSocialImage(
          cardBuffer,
          newsId,
          `${newsId}-og-${kind}.jpg`,
        )
        if (uploaded) {
          console.log(`[carouselImages] in-process Sharp card uploaded to Storage ✓ — ${newsId} (${kind})`)
          return uploaded
        }
      }
    } catch (sharpErr) {
      console.error(`[carouselImages] in-process Sharp card composite failed — ${newsId} (${kind}):`, sharpErr)
    }
  }

  console.error(
    `[carouselImages] no publishable image after OG+Sharp composite — ${newsId} (${kind}); refusing raw dynamic OG URL`,
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
  opts?: { fallbackImageUrl?: string; context?: MaterializeBrandedOgContext },
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
    opts?.context,
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
