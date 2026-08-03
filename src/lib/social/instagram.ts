/**
 * Instagram Graph API service layer.
 * Two-step publish: (1) create media container, (2) publish container.
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

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

const IG_CAPTION_LIMIT = 2200

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
 * Step 1 — Create an Instagram media container.
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

/** Full two-step Instagram publish flow. */
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

  // Instagram requires an image — skip gracefully if none
  if (!payload.imageUrl?.trim()) {
    return {
      success: false,
      error: 'Instagram için görsel URL gerekli — atlandı',
    }
  }

  const caption = buildInstagramCaption(payload)

  try {
    // Step 1: Create container
    const containerId = await createMediaContainer(
      igBusinessId,
      accessToken,
      payload.imageUrl.trim(),
      caption
    )

    console.log(`[instagram] container created for news ${payload.newsId}: ${containerId}`)

    // Brief pause between steps (IG recommends a small delay)
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Step 2: Publish
    const mediaId = await publishMediaContainer(igBusinessId, accessToken, containerId)

    console.log(`[instagram] published news ${payload.newsId} → media ${mediaId}`)
    return { success: true, platformId: mediaId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[instagram] publish failed for news ${payload.newsId}:`, msg)
    return { success: false, error: msg }
  }
}
