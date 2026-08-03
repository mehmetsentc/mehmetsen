/**
 * Facebook Graph API service layer.
 * Publishes a post to a Facebook Page using the v21.0 Graph API.
 *
 * Required env vars (server-side only, no NEXT_PUBLIC prefix):
 *   FACEBOOK_PAGE_ID           — e.g. 167304713122153
 *   FACEBOOK_PAGE_ACCESS_TOKEN — long-lived page access token
 */
import type { SocialPublishPayload, SocialPublishResult } from './types'
import { getSocialTokens } from './tokenStore'
import { buildFeedCaption } from './feedCaption'

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

/** Build the caption text for a Facebook post. */
function buildFacebookCaption(payload: SocialPublishPayload): string {
  return buildFeedCaption({
    title: payload.title,
    body: payload.description,
    articleUrl: payload.articleUrl,
    hashtags: payload.hashtags,
    maxLen: 8000,
  })
}

/**
 * Facebook Hikaye yayınla.
 * 1) Fotoğrafı unpublished yükle → photo_id
 * 2) POST /{pageId}/photo_stories + mümkünse link (tıklanabilir CTA)
 *
 * Page Stories API resmi olarak sticker/link alanını belgelemıyor; `link` kabul
 * edilmezse link olmadan yeniden deneriz. Görsel 1080×1920 (/api/og/story/[id]).
 */
export async function publishFacebookStory(
  payload: SocialPublishPayload
): Promise<SocialPublishResult> {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim()
  const { fbToken: accessToken } = await getSocialTokens()

  if (!pageId || !accessToken) {
    return { success: false, error: 'FACEBOOK_PAGE_ID veya FACEBOOK_PAGE_ACCESS_TOKEN eksik' }
  }
  if (!payload.imageUrl?.trim()) {
    return { success: false, error: 'Facebook Hikaye için görsel URL gerekli' }
  }

  const imageUrl = payload.imageUrl.trim()
  const articleUrl = payload.articleUrl?.trim() || undefined

  try {
    // Adım 1 — unpublished foto (photo_stories için photo_id gerekir; url tek adım
    // bazı uygulamalarda çalışsa da link eklemek için photo_id yolu daha tutarlı)
    const uploadParams = new URLSearchParams({
      url: imageUrl,
      published: 'false',
      access_token: accessToken,
    })
    const uploadRes = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: uploadParams.toString(),
    })
    const uploadJson = (await uploadRes.json()) as { id?: string; error?: { message?: string } }
    if (!uploadRes.ok || uploadJson.error || !uploadJson.id) {
      // Fallback: eski tek adımlı url yöntemi
      console.warn(
        `[facebook] story unpublished upload failed (${payload.newsId}): ` +
          `${uploadJson.error?.message ?? uploadRes.status} — url fallback`
      )
      return await publishFacebookStoryViaUrl(pageId, accessToken, payload.newsId, imageUrl, articleUrl)
    }

    const photoId = uploadJson.id
    const platformId = await publishPhotoStoryWithOptionalLink(
      pageId,
      accessToken,
      payload.newsId,
      photoId,
      articleUrl
    )
    console.log(`[facebook] story published for news ${payload.newsId} → ${platformId}`)
    return { success: true, platformId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[facebook] story unexpected error for news ${payload.newsId}:`, msg)
    return { success: false, error: msg }
  }
}

async function publishPhotoStoryWithOptionalLink(
  pageId: string,
  accessToken: string,
  newsId: string,
  photoId: string,
  articleUrl?: string
): Promise<string> {
  const tryPublish = async (withLink: boolean) => {
    const params = new URLSearchParams({
      photo_id: photoId,
      access_token: accessToken,
    })
    if (withLink && articleUrl) params.set('link', articleUrl)

    const res = await fetch(`${GRAPH_BASE}/${pageId}/photo_stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const json = (await res.json()) as {
      post_id?: string
      id?: string
      success?: boolean
      error?: { message?: string }
    }
    if (!res.ok || json.error) {
      throw new Error(json.error?.message ?? `photo_stories HTTP ${res.status}`)
    }
    return json.post_id ?? json.id ?? photoId
  }

  if (articleUrl) {
    try {
      const id = await tryPublish(true)
      console.log(`[facebook] story link attached for ${newsId}`)
      return id
    } catch (linkErr) {
      const msg = linkErr instanceof Error ? linkErr.message : String(linkErr)
      console.warn(`[facebook] story link reddedildi (${newsId}): ${msg} — link olmadan yeniden deneniyor`)
    }
  } else {
    console.warn(`[facebook] story articleUrl eksik — link olmadan yayınlanacak: ${newsId}`)
  }
  return tryPublish(false)
}

/** Eski tek adımlı url→photo_stories yolu (+ isteğe bağlı link denemesi). */
async function publishFacebookStoryViaUrl(
  pageId: string,
  accessToken: string,
  newsId: string,
  imageUrl: string,
  articleUrl?: string
): Promise<SocialPublishResult> {
  const tryOnce = async (withLink: boolean) => {
    const params = new URLSearchParams({
      url: imageUrl,
      access_token: accessToken,
    })
    if (withLink && articleUrl) params.set('link', articleUrl)
    const res = await fetch(`${GRAPH_BASE}/${pageId}/photo_stories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const json = (await res.json()) as { post_id?: string; id?: string; error?: { message?: string } }
    if (!res.ok || json.error) {
      throw new Error(json.error?.message ?? `HTTP ${res.status}`)
    }
    return json.post_id ?? json.id
  }

  try {
    let platformId: string | undefined
    if (articleUrl) {
      try {
        platformId = await tryOnce(true)
        console.log(`[facebook] story (url) link attached for ${newsId}`)
      } catch (linkErr) {
        const msg = linkErr instanceof Error ? linkErr.message : String(linkErr)
        console.warn(`[facebook] story (url) link reddedildi (${newsId}): ${msg}`)
        platformId = await tryOnce(false)
      }
    } else {
      platformId = await tryOnce(false)
    }
    console.log(`[facebook] story published for news ${newsId} → ${platformId}`)
    return { success: true, platformId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[facebook] story failed for news ${newsId}:`, msg)
    return { success: false, error: msg }
  }
}

/** Publish a photo post (with image) or a link post (without image) to a Facebook Page. */
export async function publishToFacebook(
  payload: SocialPublishPayload
): Promise<SocialPublishResult> {
  const pageId = process.env.FACEBOOK_PAGE_ID?.trim()
  const { fbToken: accessToken } = await getSocialTokens()

  if (!pageId || !accessToken) {
    return {
      success: false,
      error: 'FACEBOOK_PAGE_ID veya FACEBOOK_PAGE_ACCESS_TOKEN eksik',
    }
  }

  const caption = buildFacebookCaption(payload)
  const articleUrl = payload.articleUrl?.trim()

  try {
    let endpoint: string
    let body: Record<string, string>

    if (payload.imageUrl?.trim()) {
      // Markalı görsel + caption; article URL caption içinde (FB'de tıklanır)
      endpoint = `${GRAPH_BASE}/${pageId}/photos`
      body = {
        url: payload.imageUrl.trim(),
        caption,
        access_token: accessToken,
      }
    } else {
      endpoint = `${GRAPH_BASE}/${pageId}/feed`
      body = {
        message: caption,
        access_token: accessToken,
        ...(articleUrl ? { link: articleUrl } : {}),
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
