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
 *   NO dedicated link field for IMAGE feed posts. For verified / professional
 *   accounts Meta may render a URL inside the caption as clickable; we always put
 *   the full article URL in the caption.
 *
 * Stories: Meta's IG User Media reference (Story Limitations) states
 *   "Publishing stickers (i.e., link, poll, location) is not supported" — so the
 *   story container carries no link/sticker parameter (Görev 6).
 */
import type { SocialPublishPayload, SocialPublishResult } from './types'
import { getSocialTokens } from './tokenStore'
import { buildFeedCaption, isIncompleteCaption, isThinSocialCaption } from './feedCaption'
import { resolveCarouselUrls } from './carouselImages'
import { rewriteForPlatform } from '@/services/metaAiRewriteService'
import { FACEBOOK_GRAPH_BASE } from './graphConfig'
import { errorLogFields, platformError, PlatformApiError, safeErrorText, socialLog } from './safeLog'
import type { InstagramPublishTarget } from './accounts/targetTypes'
import { INVALID_TARGET_ERROR, isUsableInstagramTarget } from './accounts/targetGuards'
import { withLegacyPublishLock, type LegacyPublishOptions, type LockedPublishResult } from './accounts/legacyLock'

/** Legacy (Onyeditivi) path: Instagram API with Facebook Login. */
const GRAPH_BASE = FACEBOOK_GRAPH_BASE

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
 * Meta AI ile gövdeyi özgünleştir; ince/yarım/fail → DeepSeek (payload.description).
 * URL + hashtag buildFeedCaption tarafından eklenir.
 * Manşet overlay Meta AI üretmez — OG görsel ayrı pipeline.
 */
async function resolveInstagramCaption(payload: SocialPublishPayload): Promise<string> {
  const city = payload.cityName?.trim() || 'Çanakkale'
  const deepseekBody = (payload.description ?? '').trim()
  const content = deepseekBody || payload.title
  const ai = await rewriteForPlatform(payload.title, content, city, 'instagram', {
    articleUrl: payload.articleUrl,
    newsId: payload.newsId,
  })
  if (!ai.enabled) return buildInstagramCaption(payload)

  const metaBody = (ai.caption || '').trim()
  const metaOk =
    !!metaBody &&
    !isIncompleteCaption(metaBody) &&
    !isThinSocialCaption(metaBody, deepseekBody)

  if (!metaOk) {
    socialLog('warn', 'instagram', 'caption', { corr: payload.newsId, result: 'meta_ai_rejected' })
    return buildInstagramCaption(payload)
  }

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
    body: metaBody,
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
  caption: string,
  base: string = GRAPH_BASE
): Promise<string> {
  const res = await fetch(`${base}/${igBusinessId}/media`, {
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
    throw platformError('instagram', 'medya kapsayıcısı', res.status, json)
  }

  return json.id
}

/** Carousel child item — is_carousel_item=true, no caption. */
async function createCarouselItemContainer(
  igBusinessId: string,
  accessToken: string,
  imageUrl: string,
  base: string = GRAPH_BASE
): Promise<string> {
  const res = await fetch(`${base}/${igBusinessId}/media`, {
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
    throw platformError('instagram', 'kaydırmalı öğe', res.status, json)
  }

  return json.id
}

/** Parent carousel container with children IDs. */
async function createCarouselParentContainer(
  igBusinessId: string,
  accessToken: string,
  childIds: string[],
  caption: string,
  base: string = GRAPH_BASE
): Promise<string> {
  const res = await fetch(`${base}/${igBusinessId}/media`, {
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
    throw platformError('instagram', 'kaydırmalı kapsayıcı', res.status, json)
  }

  return json.id
}

/**
 * Wait until IG container status is FINISHED (required before carousel publish).
 */
async function waitForContainerReady(
  containerId: string,
  accessToken: string,
  base: string = GRAPH_BASE
): Promise<void> {
  for (let i = 0; i < CONTAINER_POLL_MAX; i++) {
    const res = await fetch(
      `${base}/${containerId}?fields=status_code&access_token=${encodeURIComponent(accessToken)}`
    )
    const json = (await res.json()) as {
      status_code?: string
      error?: { message?: string }
    }
    if (json.error) {
      throw platformError('instagram', 'kapsayıcı durumu', res.status, json)
    }
    const status = (json.status_code ?? '').toUpperCase()
    if (status === 'FINISHED') return
    if (status === 'ERROR' || status === 'EXPIRED') {
      throw new Error(`Instagram kapsayıcısı işlenemedi (durum ${status})`)
    }
    await new Promise((r) => setTimeout(r, CONTAINER_POLL_MS))
  }
  // Not "timed out": this happens BEFORE media_publish, so it is a certain (not uncertain) failure.
  throw new Error('Instagram kapsayıcısı hazır olmadı; yayınlama adımına geçilmedi')
}

/**
 * Step 2 — Publish the media container.
 * Returns the published media ID.
 */
async function publishMediaContainer(
  igBusinessId: string,
  accessToken: string,
  containerId: string,
  base: string = GRAPH_BASE
): Promise<string> {
  const res = await fetch(`${base}/${igBusinessId}/media_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      creation_id: containerId,
      access_token: accessToken,
    }),
  })

  const json = (await res.json()) as { id?: string; error?: { message?: string } }

  if (!res.ok || json.error || !json.id) {
    throw platformError('instagram', 'yayınlama', res.status, json)
  }

  return json.id
}

/**
 * Story için medya container'ı oluştur.
 * media_type=STORIES → Instagram Hikaye olarak yayınlanır.
 * Link / anket / konum sticker'ı API ile yayımlanamaz (Meta: Story Limitations);
 * bu yüzden hiçbir link parametresi gönderilmez.
 */
async function createStoryContainer(
  igBusinessId: string,
  accessToken: string,
  imageUrl: string,
  base: string = GRAPH_BASE
): Promise<string> {
  // application/x-www-form-urlencoded — Graph API story alanlarında JSON'dan daha güvenilir
  const params = new URLSearchParams({
    image_url: imageUrl,
    media_type: 'STORIES',
    access_token: accessToken,
  })

  const res = await fetch(`${base}/${igBusinessId}/media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const json = (await res.json()) as { id?: string; error?: { message?: string; code?: number } }

  if (!res.ok || json.error || !json.id) {
    throw platformError('instagram', 'hikâye kapsayıcısı', res.status, json)
  }

  return json.id
}

/**
 * Credentials + host for one Instagram publish.
 *   - no target → legacy: INSTAGRAM_BUSINESS_ID + getSocialTokens(), graph.facebook.com
 *   - target    → the target's IG user, token and host (graph.instagram.com for
 *                 Instagram Login, graph.facebook.com for Facebook Login)
 */
async function resolveInstagramCredentials(
  target?: InstagramPublishTarget,
): Promise<{ igBusinessId: string | undefined; accessToken: string; base: string }> {
  if (target) {
    socialLog('log', 'instagram', 'target', { account: target.accountId, method: target.connectionMethod })
    return { igBusinessId: target.igUserId, accessToken: target.accessToken, base: target.apiBase }
  }
  const igBusinessId = process.env.INSTAGRAM_BUSINESS_ID?.trim()
  const { igToken: accessToken } = await getSocialTokens()
  return { igBusinessId, accessToken, base: GRAPH_BASE }
}

/**
 * Instagram Hikaye yayınla (1080×1920 story görsel). Link sticker API ile
 * desteklenmediği için gönderilmez; tek kapsayıcı isteği yapılır.
 */
async function publishInstagramStoryUnlocked(
  payload: SocialPublishPayload,
  /** Optional explicit account. Omitted → legacy env/Firestore credentials (unchanged). */
  target?: InstagramPublishTarget,
): Promise<SocialPublishResult> {
  if (target !== undefined && !isUsableInstagramTarget(target)) {
    socialLog('error', 'instagram', 'story', { corr: payload.newsId, result: 'invalid_target' })
    return { success: false, error: INVALID_TARGET_ERROR }
  }
  const { igBusinessId, accessToken, base } = await resolveInstagramCredentials(target)

  if (!igBusinessId || !accessToken) {
    return { success: false, error: 'INSTAGRAM_BUSINESS_ID veya access token eksik' }
  }
  if (!payload.imageUrl?.trim()) {
    return { success: false, error: 'Story için görsel URL gerekli' }
  }

  const imageUrl = payload.imageUrl.trim()

  try {
    const containerId = await createStoryContainer(igBusinessId, accessToken, imageUrl, base)

    socialLog('log', 'instagram', 'story_container', { corr: payload.newsId, result: 'created' })
    await new Promise(r => setTimeout(r, 1000))

    const mediaId = await publishMediaContainer(igBusinessId, accessToken, containerId, base)
    socialLog('log', 'instagram', 'story', { corr: payload.newsId, result: 'published', mediaId })
    return { success: true, platformId: mediaId }
  } catch (err) {
    socialLog('error', 'instagram', 'story', { corr: payload.newsId, result: 'failed', ...errorLogFields(err) })
    return { success: false, error: safeErrorText(err) }
  }
}

async function publishSingleImage(
  igBusinessId: string,
  accessToken: string,
  newsId: string,
  imageUrl: string,
  caption: string,
  base: string = GRAPH_BASE
): Promise<SocialPublishResult> {
  socialLog('log', 'instagram', 'single', { corr: newsId, result: 'start' })
  const containerId = await createMediaContainer(
    igBusinessId,
    accessToken,
    imageUrl,
    caption,
    base
  )
  socialLog('log', 'instagram', 'single', { corr: newsId, result: 'container_created' })
  await new Promise((resolve) => setTimeout(resolve, 1000))
  const mediaId = await publishMediaContainer(igBusinessId, accessToken, containerId, base)
  socialLog('log', 'instagram', 'single', { corr: newsId, result: 'published', mediaId })
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
  fallbackImageUrl: string,
  base: string = GRAPH_BASE,
  /** Explicit carousel choice: never degrade to a single image. */
  strict = false,
): Promise<SocialPublishResult> {
  socialLog('log', 'instagram', 'carousel', { corr: newsId, result: 'start', slides: imageUrls.length })

  const childIds: string[] = []
  for (let i = 0; i < imageUrls.length; i++) {
    const url = imageUrls[i]
    try {
      const id = await createCarouselItemContainer(igBusinessId, accessToken, url, base)
      await waitForContainerReady(id, accessToken, base)
      childIds.push(id)
      socialLog('log', 'instagram', 'carousel_child', { corr: newsId, slide: i + 1, result: 'ready' })
    } catch (err) {
      socialLog('warn', 'instagram', 'carousel_child', { corr: newsId, slide: i + 1, result: 'skipped', ...errorLogFields(err) })
    }
  }

  if (childIds.length < 2) {
    if (strict) {
      socialLog('warn', 'instagram', 'carousel_children', { corr: newsId, ready: childIds.length, result: 'rejected_strict' })
      return { success: false, error: 'Instagram kaydırmalı öğeleri hazırlanamadı (en az 2 gerekli) — tek görsele düşülmedi, yayın yapılmadı' }
    }
    socialLog('warn', 'instagram', 'carousel_children', { corr: newsId, ready: childIds.length, result: 'single_fallback' })
    return publishSingleImage(
      igBusinessId,
      accessToken,
      newsId,
      fallbackImageUrl,
      caption,
      base
    )
  }

  let publishStep = false
  try {
    const parentId = await createCarouselParentContainer(
      igBusinessId,
      accessToken,
      childIds,
      caption,
      base
    )
    socialLog('log', 'instagram', 'carousel', { corr: newsId, result: 'parent_created' })
    await waitForContainerReady(parentId, accessToken, base)
    publishStep = true
    const mediaId = await publishMediaContainer(igBusinessId, accessToken, parentId, base)
    socialLog('log', 'instagram', 'carousel', { corr: newsId, result: 'published', mediaId, slides: childIds.length })
    return { success: true, platformId: mediaId }
  } catch (err) {
    // media_publish sent and the answer was lost (not a clear platform
    // rejection): the carousel may be live — a single-image fallback could
    // double-post. Surface the transport error (→ uncertain), never fall back.
    if (publishStep && !(err instanceof PlatformApiError)) throw err
    // Server-side / unknown Meta error on media_publish (HTTP 5xx, code 1/2):
    // the carousel may still have gone live → no single-image fallback either.
    if (publishStep && err instanceof PlatformApiError && (err.fields.status >= 500 || err.fields.code === 1 || err.fields.code === 2)) {
      return { success: false, error: safeErrorText(err) }
    }
    if (strict) {
      socialLog('warn', 'instagram', 'carousel', { corr: newsId, result: 'failed_strict', ...errorLogFields(err) })
      return { success: false, error: safeErrorText(err) }
    }
    socialLog('warn', 'instagram', 'carousel', { corr: newsId, result: 'failed_single_fallback', ...errorLogFields(err) })
    return publishSingleImage(
      igBusinessId,
      accessToken,
      newsId,
      fallbackImageUrl,
      caption,
      base
    )
  }
}

/** Full two-step Instagram publish flow (single or carousel). */
async function publishToInstagramUnlocked(
  payload: SocialPublishPayload,
  /** Optional explicit account. Omitted → legacy env/Firestore credentials (unchanged). */
  target?: InstagramPublishTarget
): Promise<SocialPublishResult> {
  if (target !== undefined && !isUsableInstagramTarget(target)) {
    socialLog('error', 'instagram', 'post', { corr: payload.newsId, result: 'invalid_target' })
    return { success: false, error: INVALID_TARGET_ERROR }
  }
  const { igBusinessId, accessToken, base } = await resolveInstagramCredentials(target)

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
        singleUrl,
        base,
        payload.imageMode === 'carousel',
      )
    }
    if (payload.imageMode === 'carousel') {
      return { success: false, error: 'Kaydırmalı için en az 2 görsel gerekli — tek görsele düşülmedi, yayın yapılmadı' }
    }
    return await publishSingleImage(
      igBusinessId,
      accessToken,
      payload.newsId,
      singleUrl,
      caption,
      base
    )
  } catch (err) {
    socialLog('error', 'instagram', 'publish', { corr: payload.newsId, result: 'failed', ...errorLogFields(err) })
    return { success: false, error: safeErrorText(err) }
  }
}

// ── Shared publish lock (legacy path) ──────────────────────────────────────────

/**
 * publishToInstagram — explicit target: the caller (publishToTarget) already holds the
 * account-scoped ledger claim. No target: legacy Onyeditivi credentials,
 * guarded by the shared ledger lock (see accounts/legacyLock.ts).
 */
export async function publishToInstagram(
  payload: SocialPublishPayload,
  target?: InstagramPublishTarget,
  legacy?: LegacyPublishOptions,
): Promise<LockedPublishResult> {
  if (target !== undefined) return publishToInstagramUnlocked(payload, target)
  return withLegacyPublishLock(
    { platform: 'instagram', format: 'post', newsId: payload.newsId, options: legacy },
    () => publishToInstagramUnlocked(payload),
  )
}

/**
 * publishInstagramStory — explicit target: the caller (publishToTarget) already holds the
 * account-scoped ledger claim. No target: legacy Onyeditivi credentials,
 * guarded by the shared ledger lock (see accounts/legacyLock.ts).
 */
export async function publishInstagramStory(
  payload: SocialPublishPayload,
  target?: InstagramPublishTarget,
  legacy?: LegacyPublishOptions,
): Promise<LockedPublishResult> {
  if (target !== undefined) return publishInstagramStoryUnlocked(payload, target)
  return withLegacyPublishLock(
    { platform: 'instagram', format: 'story', newsId: payload.newsId, options: legacy },
    () => publishInstagramStoryUnlocked(payload),
  )
}
