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
 */
import type { SocialPublishPayload, SocialPublishResult } from './types'
import { getSocialTokens } from './tokenStore'

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

// Instagram caption limiti 2200 karakter
const IG_CAPTION_LIMIT = 2200

/** Build the caption text for an Instagram post. */
function buildInstagramCaption(payload: SocialPublishPayload): string {
  const lines: string[] = []
  lines.push(`📰 ${payload.title.trim()}`)
  if (payload.description?.trim()) {
    lines.push('')
    lines.push(payload.description.trim())
  }
  if (payload.articleUrl?.trim()) {
    lines.push('')
    lines.push(`Haberi Oku:\n${payload.articleUrl.trim()}`)
  }
  lines.push('')
  lines.push('#NaHaber #Çanakkale #SonDakika')
  const caption = lines.join('\n')
  // Instagram 2200 karakter limitini aşma
  return caption.length > IG_CAPTION_LIMIT ? caption.slice(0, IG_CAPTION_LIMIT - 1) + '…' : caption
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
 * link_sticker_url → haberin linki hikayeye sticker olarak eklenir.
 */
async function createStoryContainer(
  igBusinessId: string,
  accessToken: string,
  imageUrl: string,
  articleUrl?: string
): Promise<string> {
  const body: Record<string, string> = {
    image_url:  imageUrl,
    media_type: 'STORIES',
    access_token: accessToken,
  }
  // Link sticker — bazı hesaplarda aktif olmayabilir; API hata verirse graceful devam et
  if (articleUrl) body.link_sticker_url = articleUrl

  const res = await fetch(`${GRAPH_BASE}/${igBusinessId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const json = (await res.json()) as { id?: string; error?: { message?: string } }

  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message ?? `Story container HTTP ${res.status}`)
  }

  return json.id
}

/**
 * Instagram Hikaye yayınla (1080×1920 story görsel + link sticker).
 * - Görsel /api/og/story/[id] route'undan gelir
 * - Başarısız olursa error döner, fırlatmaz
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

  try {
    const containerId = await createStoryContainer(
      igBusinessId,
      accessToken,
      payload.imageUrl.trim(),
      payload.articleUrl
    )

    console.log(`[instagram] story container created for ${payload.newsId}: ${containerId}`)
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
