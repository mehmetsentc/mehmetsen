/**
 * Facebook Graph API service layer.
 * Publishes a post to a Facebook Page using the v21.0 Graph API.
 *
 * Required env vars (server-side only, no NEXT_PUBLIC prefix):
 *   FACEBOOK_PAGE_ID           — e.g. 167304713122153
 *   FACEBOOK_PAGE_ACCESS_TOKEN — long-lived page access token
 */
import type { SocialPublishPayload, SocialPublishResult } from './types'

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

/** Build the caption text for a Facebook post. */
function buildFacebookCaption(payload: SocialPublishPayload): string {
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

/** Publish a photo post (with image) or a link post (without image) to a Facebook Page. */
export async function publishToFacebook(
  payload: SocialPublishPayload
): Promise<SocialPublishResult> {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim()
  const accessToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim()

  if (!pageId || !accessToken) {
    return {
      success: false,
      error: 'FACEBOOK_PAGE_ID veya FACEBOOK_PAGE_ACCESS_TOKEN eksik',
    }
  }

  const caption = buildFacebookCaption(payload)

  try {
    let endpoint: string
    let body: Record<string, string>

    if (payload.imageUrl?.trim()) {
      // Photo post — attach image as link, message as caption
      endpoint = `${GRAPH_BASE}/${pageId}/photos`
      body = {
        url: payload.imageUrl.trim(),
        caption,
        access_token: accessToken,
      }
    } else {
      // Link post — no image
      endpoint = `${GRAPH_BASE}/${pageId}/feed`
      body = {
        message: caption,
        access_token: accessToken,
        ...(payload.articleUrl ? { link: payload.articleUrl.trim() } : {}),
      }
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    const json = (await res.json()) as { id?: string; error?: { message?: string } }

    if (!res.ok || json.error) {
      const msg = json.error?.message ?? `HTTP ${res.status}`
      console.error(`[facebook] publish failed for news ${payload.newsId}:`, msg)
      return { success: false, error: msg }
    }

    console.log(`[facebook] published news ${payload.newsId} → post ${json.id}`)
    return { success: true, platformId: json.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[facebook] unexpected error for news ${payload.newsId}:`, msg)
    return { success: false, error: msg }
  }
}
