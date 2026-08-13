/**
 * Instagram Graph API service layer.
 * Two-step publish: (1) create media container, (2) publish container.
 * Multi-image: carousel children → parent CAROUSEL → media_publish.
 *
 * Required env vars (server-side only):
 *   INSTAGRAM_BUSINESS_ID      — e.g. 17841477331518718
 *   FACEBOOK_PAGE_ACCESS_TOKEN — same token used for Facebook (must have instagram_basic,
 *                                 instagram_content_publish permissions)
 *
 * NOTE: Instagram requires a PUBLIC image URL for media containers.
 *       If imageUrl is missing, we skip Instagram (image is mandatory for IG posts).
 *
 * Feed post links:
 *   Graph API `POST /{ig-user-id}/media` has caption, image_url, alt_text, etc. —
 *   NO dedicated `link` / `link_sticker_url` for IMAGE feed posts (link_sticker_url
 *   is Stories-only). For verified / professional accounts Meta may render a URL
 *   inside the caption as clickable; we always put the full article URL in the caption.
 */
import type { SocialPublishPayload, SocialPublishResult } from './types'
import { getSocialTokens } from './tokenStore'
import { buildFeedCaption } from './feedCaption'
import { resolveCarouselUrls } from './carouselImages'
import { rewriteForPlatform } from '@/services/metaAiRewriteService'

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

const IG_CAPTION_LIMIT = 2200
const CONTAINER_POLL_MS = 1500
const CONTAINER_POLL_MAX = 20

/** Build the caption text for an Instagram feed post. */
function buildInstagramCaption(payload: SocialPublishPayload): string {
  return buildFeedCaption({
    title: payload.title,
    body: payload.description,
    articleUrl: payload.articleUrl,
    hashtags: payload.hashtags,
    maxLen: IG_CAPTION_LIMIT,
  })
}

/**
 * Meta AI ile gövdeyi özgünleştir; fail → yerel caption.
 * URL + hashtag buildFeedCaption tarafından eklenir.
 */
async function resolveInstagramCaption(payload: SocialPublishPayload): Promise<string> {
  const city = payload.cityName?.trim() || 'Çanakkale'
  const content = (payload.description ?? '').trim() || payload.title
  const ai = await rewriteForPlatform(payload.title, content, city, 'instagram', {
    articleUrl: payload.articleUrl,
    newsId: payload.newsId,
  })
  if (!ai.enabled) return buildInstagramCaption(payload)

  const baseTags = payload.hashtags ?? []
  const merged =
    ai.hashtags.length > 0
      ? [
          ...ai.hashtags,
          ...baseTags.filter(
            (t) =>
              !ai.hashtags.some(
                (h) => h.toLocaleLowerCase('tr-TR') === String(t).trim().toLocaleLowerCase('tr-TR'),
              ),
          ),
        ].slice(0, 5)
      : baseTags

  return buildFeedCaption({
    title: payload.title,
    body: ai.caption,
    articleUrl: payload.articleUrl,
    hashtags: merged,
    maxLen: IG_CAPTION_LIMIT,
  })
}

/**
 * Step 1 — Create an Instagram media container (single IMAGE post).
 * Returns the container ID or throws.
 */
async function createMediaContainer(
  igBusinessId: string,
  accessToken: string,
  imageUrl: string,
  caption: string
): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${igBusinessId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      caption,
      access_token: accessToken,
    }),
  })

  const json = (await res.json()) as { id?: string; error?: { message?: string } }

  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message ?? `Container creation HTTP ${res.status}`)
  }

  return json.id
}

/** Carousel child item — is_carousel_item=true, no caption. */
async function createCarouselItemContainer(
  igBusinessId: string,
  accessToken: string,
  imageUrl: string
): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${igBusinessId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      image_url: imageUrl,
      is_carousel_item: true,
      access_token: accessToken,
    }),
  })

  const json = (await res.json()) as { id?: string; error?: { message?: string } }

  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message ?? `Carousel item HTTP ${res.status}`)
  }

  return json.id
}

/** Parent carousel container with children IDs. */
async function createCarouselParentContainer(
  igBusinessId: string,
  accessToken: string,
  childIds: string[],
  caption: string
): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${igBusinessId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      media_type: 'CAROUSEL',
      children: childIds.join(','),
      caption,
      access_token: accessToken,
    }),
  })

  const json = (await res.json()) as { id?: string; error?: { message?: string } }

  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message ?? `Carousel parent HTTP ${res.status}`)
  }

  return json.id
}

/**
 * Wait until IG container status is FINISHED (required before carousel publish).
 */
async function waitForContainerReady(
  containerId: string,
  accessToken: string
): Promise<void> {
  for (let i = 0; i < CONTAINER_POLL_MAX; i++) {
    const res = await fetch(
      `${GRAPH_BASE}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
    )
    const json = (await res.json()) as {
      status_code?: string
      error?: { message?: string }
    }
    if (json.error) {
      throw new Error(json.error.message ?? 'Container status error')
    }
    const status = (json.status_code ?? '').toUpperCase()
    if (status === 'FINISHED') return
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`Container ${containerId} status=${status}`)
    }
    await new Promise((r) => setTimeout(r, CONTAINER_POLL_MS))
  }
  throw new Error(`Container ${containerId} timed out waiting for FINISHED`)
}

/**
 * Step 2 — Publish the media container.
 * Returns the published media ID.
 */
async function publishMediaContainer(
  igBusinessId: string,
  accessToken: string,
  containerId: string
): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${igBusinessId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken,
    }),
  })

  const json = (await res.json()) as { id?: string; error?: { message?: string } }

  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message ?? `Publish HTTP ${res.status}`)
  }

  return json.id
}

/**
 * Story için medya container'ı oluştur.
 * media_type=STORIES → Instagram Hikaye olarak yayınlanır.
 * link_sticker_url → profesyonel hesaplarda tıklanabilir haber linki (desteklenirse).
 *
 * Meta resmi olarak sticker yayınını desteklemediğini söyler; bazı Business hesaplarda
 * link_sticker_url yine de kabul edilir. Hata olursa çağıran taraf link olmadan yeniden dener.
 */
async function createStoryContainer(
  igBusinessId: string,
  accessToken: string,
  imageUrl: string,
  articleUrl?: string
): Promise<string> {
  const link = articleUrl?.trim()
  // application/x-www-form-urlencoded — Graph API story alanlarında JSON'dan daha güvenilir
  const params = new URLSearchParams({
    image_url: imageUrl,
    media_type: 'STORIES',
    access_token: accessToken,
  })
  if (link) params.set('link_sticker_url', link)

  const res = await fetch(`${GRAPH_BASE}/${igBusinessId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const json = (await res.json()) as { id?: string; error?: { message?: string; code?: number } }

  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message ?? `Story container HTTP ${res.status}`)
  }

  return json.id
}

function isLinkStickerError(msg: string): boolean {
  const m = msg.toLowerCase()
  return (
    m.includes('link_sticker') ||
    m.includes('link sticker') ||
    m.includes('invalid parameter') ||
    m.includes('unsupported') ||
    m.includes('not supported') ||
    m.includes('stickers')
  )
}

/**
 * Instagram Hikaye yayınla (1080×1920 story görsel + mümkünse link sticker).
 * Önce articleUrl ile dener; link reddedilirse link olmadan tekrar dener (hikaye yine yayınlanır).
 */
export async function publishInstagramStory(payload: SocialPublishPayload): Promise<SocialPublishResult> {
  const igBusinessId = process.env.INSTAGRAM_BUSINESS_ID?.trim()
  const { igToken: accessToken } = await getSocialTokens()

  if (!igBusinessId || !accessToken) {
    return { success: false, error: 'INSTAGRAM_BUSINESS_ID veya access token eksik' }
  }
  if (!payload.imageUrl?.trim()) {
    return { success: false, error: 'Story için görsel URL gerekli' }
  }

  const imageUrl = payload.imageUrl.trim()
  const articleUrl = payload.articleUrl?.trim() || undefined

  try {
    let containerId: string
    let usedLink = false

    if (articleUrl) {
      try {
        containerId = await createStoryContainer(igBusinessId, accessToken, imageUrl, articleUrl)
        usedLink = true
      } catch (linkErr) {
        const linkMsg = linkErr instanceof Error ? linkErr.message : String(linkErr)
        console.warn(
          `[instagram] story link_sticker_url reddedildi (${payload.newsId}): ${linkMsg} — link olmadan yeniden deneniyor`
        )
        if (!isLinkStickerError(linkMsg) && /rate limit|oauth|permission|token/i.test(linkMsg)) {
          throw linkErr
        }
        containerId = await createStoryContainer(igBusinessId, accessToken, imageUrl, undefined)
      }
    } else {
      console.warn(`[instagram] story articleUrl eksik — link sticker olmadan yayınlanacak: ${payload.newsId}`)
      containerId = await createStoryContainer(igBusinessId, accessToken, imageUrl, undefined)
    }

    console.log(
      `[instagram] story container created for ${payload.newsId}: ${containerId}` +
        (usedLink ? ' (link_sticker_url=yes)' : ' (link_sticker_url=no)')
    )
    await new Promise(r => setTimeout(r, 1000))

    const mediaId = await publishMediaContainer(igBusinessId, accessToken, containerId)
    console.log(`[instagram] story published for ${payload.newsId} → ${mediaId}`)
    return { success: true, platformId: mediaId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[instagram] story failed for ${payload.newsId}:`, msg)
    return { success: false, error: msg }
  }
}

async function publishSingleImage(
  igBusinessId: string,
  accessToken: string,
  newsId: string,
  imageUrl: string,
  caption: string
): Promise<SocialPublishResult> {
  console.log(`[instagram] single — ${newsId}`)
  const containerId = await createMediaContainer(
    igBusinessId,
    accessToken,
    imageUrl,
    caption
  )
  console.log(`[instagram] container created for news ${newsId}: ${containerId}`)
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const mediaId = await publishMediaContainer(igBusinessId, accessToken, containerId)
  console.log(`[instagram] published news ${newsId} → media ${mediaId}`)
  return { success: true, platformId: mediaId }
}

/**
 * Carousel: child containers → wait FINISHED → parent CAROUSEL → publish.
 * Bozuk slide'lar atlanır; <2 child kalırsa veya parent fail → single fallback.
 */
async function publishCarousel(
  igBusinessId: string,
  accessToken: string,
  newsId: string,
  imageUrls: string[],
  caption: string,
  fallbackImageUrl: string
): Promise<SocialPublishResult> {
  console.log(`[instagram] carousel — ${newsId} (${imageUrls.length} slides)`)

  const childIds: string[] = []
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i]
    try {
      const id = await createCarouselItemContainer(igBusinessId, accessToken, url)
      await waitForContainerReady(id, accessToken)
      childIds.push(id)
      console.log(`[instagram] carousel child ${i + 1}/${imageUrls.length} ready: ${id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[instagram] carousel child skip ${i + 1} (${newsId}): ${msg}`)
    }
  }

  if (childIds.length < 2) {
    console.warn(
      `[instagram] carousel insufficient children (${childIds.length}) → single fallback — ${newsId}`
    )
    return publishSingleImage(
      igBusinessId,
      accessToken,
      newsId,
      fallbackImageUrl,
      caption
    )
  }

  try {
    const parentId = await createCarouselParentContainer(
      igBusinessId,
      accessToken,
      childIds,
      caption
    )
    console.log(`[instagram] carousel parent created for ${newsId}: ${parentId}`)
    await waitForContainerReady(parentId, accessToken)
    const mediaId = await publishMediaContainer(igBusinessId, accessToken, parentId)
    console.log(`[instagram] carousel published ${newsId} → media ${mediaId} (${childIds.length} slides)`)
    return { success: true, platformId: mediaId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[instagram] carousel publish failed → single fallback (${newsId}): ${msg}`)
    return publishSingleImage(
      igBusinessId,
      accessToken,
      newsId,
      fallbackImageUrl,
      caption
    )
  }
}

/** Full two-step Instagram publish flow (single or carousel). */
export async function publishToInstagram(
  payload: SocialPublishPayload
): Promise<SocialPublishResult> {
  const igBusinessId = process.env.INSTAGRAM_BUSINESS_ID?.trim()
  const { igToken: accessToken } = await getSocialTokens()

  if (!igBusinessId || !accessToken) {
    return {
      success: false,
      error: 'INSTAGRAM_BUSINESS_ID veya INSTAGRAM_ACCESS_TOKEN / FACEBOOK_PAGE_ACCESS_TOKEN eksik',
    }
  }

  const carouselUrls = resolveCarouselUrls(payload)
  const singleUrl = payload.imageUrl?.trim() || carouselUrls?.[0]

  if (!singleUrl) {
    return {
      success: false,
      error: 'Instagram için görsel URL gerekli — atlandı',
    }
  }

  const caption = await resolveInstagramCaption(payload)

  try {
    if (carouselUrls && carouselUrls.length >= 2) {
      return await publishCarousel(
        igBusinessId,
        accessToken,
        payload.newsId,
        carouselUrls,
        caption,
        singleUrl
      )
    }
    return await publishSingleImage(
      igBusinessId,
      accessToken,
      payload.newsId,
      singleUrl,
      caption
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[instagram] publish failed for news ${payload.newsId}:`, msg)
    return { success: false, error: msg }
  }
}
