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

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

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
  return lines.join('\n')
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

/** Full two-step Instagram publish flow. */
export async function publishToInstagram(
  payload: SocialPublishPayload
): Promise<SocialPublishResult> {
  const igBusinessId = process.env.INSTAGRAM_BUSINESS_ID?.trim()
  // Prefer Instagram-specific token; fall back to Facebook Page Access Token
  const accessToken = (process.env.INSTAGRAM_ACCESS_TOKEN?.trim() || process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim())

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
