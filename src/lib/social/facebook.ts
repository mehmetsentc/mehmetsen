/**
 * Facebook Graph API service layer.
 * Publishes a post to a Facebook Page using the v21.0 Graph API.
 * Multi-image: unpublished photo uploads → feed with attached_media.
 *
 * Required env vars (server-side only, no NEXT_PUBLIC prefix):
 *   FACEBOOK_PAGE_ID           — e.g. 167304713122153
 *   FACEBOOK_PAGE_ACCESS_TOKEN — long-lived page access token
 */
import type { SocialPublishPayload, SocialPublishResult } from './types'
import { getSocialTokens } from './tokenStore'
import { buildFeedCaption } from './feedCaption'
import { resolveCarouselUrls } from './carouselImages'

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`

/** Build the caption text for a Facebook post. */
function buildFacebookCaption(
  payload: SocialPublishPayload,
  opts?: { omitUrl?: boolean },
): string {
  return buildFeedCaption({
    title: payload.title,
    body: payload.description,
    articleUrl: opts?.omitUrl ? undefined : payload.articleUrl,
    hashtags: payload.hashtags,
    maxLen: 8000,
  })
}

/**
 * Fotoğraf postunun altına ilk yorum olarak makale linkini ekle.
 * Bağlantıyı caption yerine yoruma taşımak Facebook algoritmasında
 * "outbound link" sinyalini kaldırır → organik erişim artar.
 * Başarısızlık post yayınını engellemez.
 */
async function addLinkComment(
  pageId: string,
  accessToken: string,
  postId: string,
  articleUrl: string,
): Promise<void> {
  try {
    const res = await fetch(`${GRAPH_BASE}/${postId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `🔗 Haberin devamı: ${articleUrl}`,
        access_token: accessToken,
      }),
    })
    if (res.ok) {
      console.log(`[facebook] link comment added to ${postId}`)
    } else {
      const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } }
      console.warn(`[facebook] link comment failed for ${postId}: ${json.error?.message ?? res.status}`)
    }
  } catch (err) {
    console.warn(`[facebook] link comment error for ${postId}:`, err)
  }
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

/** Tek fotoğraf postu (published). */
async function publishSinglePhoto(
  pageId: string,
  accessToken: string,
  newsId: string,
  imageUrl: string,
  caption: string
): Promise<SocialPublishResult> {
  console.log(`[facebook] single — ${newsId}`)
  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: imageUrl,
      caption,
      access_token: accessToken,
    }),
  })
  const json = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok || json.error || !json.id) {
    const msg = json.error?.message ?? `HTTP ${res.status}`
    console.error(`[facebook] publish failed for news ${newsId}:`, msg)
    return { success: false, error: msg }
  }
  console.log(`[facebook] published news ${newsId} → post ${json.id}`)
  return { success: true, platformId: json.id }
}

/** Unpublished foto yükle — multi-photo attached_media için. */
async function uploadUnpublishedPhoto(
  pageId: string,
  accessToken: string,
  imageUrl: string
): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: imageUrl,
      published: false,
      access_token: accessToken,
    }),
  })
  const json = (await res.json()) as { id?: string; error?: { message?: string } }
  if (!res.ok || json.error || !json.id) {
    throw new Error(json.error?.message ?? `Unpublished upload HTTP ${res.status}`)
  }
  return json.id
}

/**
 * Multi-photo: her görseli unpublished yükle → feed + attached_media.
 * Bozuk slide atlanır; <2 foto kalırsa veya feed fail → single fallback.
 */
async function publishMultiPhoto(
  pageId: string,
  accessToken: string,
  newsId: string,
  imageUrls: string[],
  caption: string,
  fallbackImageUrl: string
): Promise<SocialPublishResult> {
  console.log(`[facebook] carousel — ${newsId} (${imageUrls.length} slides)`)

  const photoIds: string[] = []
  for (let i = 0; i < imageUrls.length; i++) {
    try {
      const id = await uploadUnpublishedPhoto(pageId, accessToken, imageUrls[i])
      photoIds.push(id)
      console.log(`[facebook] unpublished photo ${i + 1}/${imageUrls.length}: ${id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[facebook] multi-photo skip slide ${i + 1} (${newsId}): ${msg}`)
    }
  }

  if (photoIds.length < 2) {
    console.warn(
      `[facebook] multi-photo insufficient (${photoIds.length}) → single fallback — ${newsId}`
    )
    return publishSinglePhoto(pageId, accessToken, newsId, fallbackImageUrl, caption)
  }

  try {
    const attached_media = photoIds.map((id) => ({ media_fbid: id }))
    const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: caption,
        attached_media,
        access_token: accessToken,
      }),
    })
    const json = (await res.json()) as { id?: string; error?: { message?: string } }
    if (!res.ok || json.error || !json.id) {
      throw new Error(json.error?.message ?? `Multi-photo feed HTTP ${res.status}`)
    }
    console.log(
      `[facebook] multi-photo published ${newsId} → post ${json.id} (${photoIds.length} photos)`
    )
    return { success: true, platformId: json.id }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[facebook] multi-photo failed → single fallback (${newsId}): ${msg}`)
    return publishSinglePhoto(pageId, accessToken, newsId, fallbackImageUrl, caption)
  }
}

/** Publish a photo post (single or multi), or a link post (without image). */
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

  const articleUrl = payload.articleUrl?.trim()
  const carouselUrls = resolveCarouselUrls(payload)
  const singleUrl = payload.imageUrl?.trim() || carouselUrls?.[0]
  const hasImage = !!singleUrl

  // Fotoğraf postlarında URL'yi caption'dan çıkar → ilk yorum olarak ekle.
  // Facebook algoritması caption'daki outbound link'leri cezalandırır;
  // yorum olarak eklemek bu sinyali kaldırır, organik erişimi artırır.
  const caption = buildFacebookCaption(payload, hasImage ? { omitUrl: true } : undefined)

  try {
    if (carouselUrls && carouselUrls.length >= 2 && singleUrl) {
      const result = await publishMultiPhoto(
        pageId,
        accessToken,
        payload.newsId,
        carouselUrls,
        caption,
        singleUrl
      )
      if (result.success && result.platformId && articleUrl) {
        await addLinkComment(pageId, accessToken, result.platformId, articleUrl)
      }
      return result
    }

    if (singleUrl) {
      const result = await publishSinglePhoto(pageId, accessToken, payload.newsId, singleUrl, caption)
      if (result.success && result.platformId && articleUrl) {
        await addLinkComment(pageId, accessToken, result.platformId, articleUrl)
      }
      return result
    }

    // Görselsiz link post — URL caption'da kalır + link alanı
    const res = await fetch(`${GRAPH_BASE}/${pageId}/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: caption,
        access_token: accessToken,
        ...(articleUrl ? { link: articleUrl } : {}),
      }),
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
