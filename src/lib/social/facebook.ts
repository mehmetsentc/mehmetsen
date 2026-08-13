/**
 * Facebook Graph API — Page photo posts (direct graph.facebook.com).
 *
 * Flow:
 *   1. Validate public image (download + width ≥ 800) — otherwise skip FB
 *   2. POST /{page-id}/photos  (url, caption, published=true, privacy EVERYONE)
 *   3. POST /{post-id}/comments with article link + "Kaynak: onyeditivi.com"
 *
 * Never posts via /{page-id}/feed with link.
 * Never puts https URLs in the caption.
 *
 * Credentials (BYO App):
 *   Prefer per-site app in Firestore config/socialFacebookApps (onyeditivi primary).
 *   Fallback: FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN / config/socialMedia
 *   (logs "global app kullanıldı" on fallback).
 */
import sharp from 'sharp'
import type { SocialPublishPayload, SocialPublishResult } from './types'
import { resolveFacebookCredentials } from './facebookCredentials'
import { PRIMARY_FACEBOOK_SITE_ID } from './facebookAppStore'
import { clampCompleteSentences } from './feedCaption'
import {
  checkFacebookRateLimit,
  recordFacebookPublish,
} from './facebookRateLimit'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'
import { getSiteUrl } from '@/lib/seo'
import { ROUTES } from '@/constants/routes'
import { buildSocialImagePayload } from './carouselImages'
import { buildOgSocialUrl } from './ogCacheVersion'
import { clampAtWordBoundary, clampCompleteHeadline } from './feedCaption'
import { generateSocialContent } from './aiSocialEditor'
import { rewriteForSocial, rewriteForPlatform, logAiRewrite } from '@/services/metaAiRewriteService'

const GRAPH_API_VERSION = 'v21.0'
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`
const GRAPH_UA = 'NaHaber/1.0 (+https://www.nahaber.com)'
const MIN_IMAGE_WIDTH = 800
const ALLOWED_HASHTAGS = new Set(['#çanakkale', '#sondakika'])

const DISTRICT_CITY_LABELS: Record<string, string> = {
  canakkale: 'Çanakkale',
  biga: 'Biga',
  can: 'Çan',
  yenice: 'Yenice',
  bayramic: 'Bayramiç',
  ezine: 'Ezine',
  ayvacik: 'Ayvacık',
  gokceada: 'Gökçeada',
  bozcaada: 'Bozcaada',
  gelibolu: 'Gelibolu',
  eceabat: 'Eceabat',
  lapseki: 'Lapseki',
}

// ── Caption helpers ──────────────────────────────────────────────────────────

function stripUrls(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function significantTokens(s: string): Set<string> {
  return new Set(
    s
      .toLocaleLowerCase('tr-TR')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  )
}

/** First 1–2 complete sentences from summary text. */
function firstTwoSentences(text: string): string {
  const cleaned = stripUrls(text).replace(/\s+/g, ' ').trim()
  if (!cleaned) return ''
  const withEnds = /[.!?…]/.test(cleaned) ? cleaned : `${cleaned}.`
  return clampCompleteSentences(withEnds, 420, 480)
}

/**
 * Caption must not reuse the feed title verbatim / same word bag.
 * Prefer original summary sentences; lightly rewrite if too close to title.
 */
function rewriteAwayFromTitle(summary: string, title: string): string {
  let body = firstTwoSentences(summary || title)
  const titleNorm = stripUrls(title).replace(/\s+/g, ' ').trim()
  if (!body) {
    body = `${clampAtWordBoundary(titleNorm, 100)} gelişmesi yaşandı. Ayrıntılar haberimizde.`
  }

  const bodyNorm = body.replace(/\s+/g, ' ').trim()
  if (
    bodyNorm.toLocaleLowerCase('tr-TR') === titleNorm.toLocaleLowerCase('tr-TR') ||
    bodyNorm.toLocaleLowerCase('tr-TR').startsWith(titleNorm.toLocaleLowerCase('tr-TR'))
  ) {
    const words = titleNorm.split(/\s+/).filter(Boolean)
    if (words.length >= 4) {
      const rotated = [...words.slice(2), ...words.slice(0, 2)].join(' ')
      body = `${clampAtWordBoundary(rotated, 110)}. Gelişmenin ayrıntıları netleşiyor.`
    } else {
      body = `Çanakkale gündeminde: ${clampAtWordBoundary(titleNorm, 90)}. Gelişmeler sürüyor.`
    }
  } else {
    // Drop overlapping title phrase if pasted at the start
    const re = new RegExp(`^${titleNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[.!?…]?\\s*`, 'iu')
    body = body.replace(re, '').trim() || body
  }

  // If still mostly the same tokens as the title, force a soft rewrite
  const tSet = significantTokens(titleNorm)
  const bSet = significantTokens(body)
  if (tSet.size > 0) {
    let overlap = 0
    for (const w of bSet) if (tSet.has(w)) overlap++
    const ratio = overlap / Math.max(tSet.size, 1)
    if (ratio >= 0.85 && bSet.size <= tSet.size + 2) {
      body = `Bölgede dikkat çeken gelişme: ${clampAtWordBoundary(
        [...tSet].slice(0, 8).join(' '),
        100,
      )}. Özet bilgi paylaşılıyor.`
    }
  }

  return firstTwoSentences(stripUrls(body))
}

function resolveCityLabel(payload: SocialPublishPayload): string {
  if (payload.cityName?.trim()) return payload.cityName.trim()
  const slug = (payload.citySlug ?? '').toLowerCase().trim()
  if (slug && DISTRICT_CITY_LABELS[slug]) return DISTRICT_CITY_LABELS[slug]
  if (slug) {
    return slug.charAt(0).toUpperCase() + slug.slice(1)
  }
  return 'Çanakkale'
}

function allowedHashtags(tags?: string[]): string[] {
  const out: string[] = []
  for (const raw of tags ?? []) {
    const t = String(raw).trim()
    if (!t) continue
    const withHash = t.startsWith('#') ? t : `#${t}`
    const key = withHash.toLocaleLowerCase('tr-TR')
    if (!ALLOWED_HASHTAGS.has(key)) continue
    const canonical = key === '#çanakkale' ? '#Çanakkale' : '#SonDakika'
    if (!out.includes(canonical)) out.push(canonical)
    if (out.length >= 2) break
  }
  return out
}

/** Facebook photo caption — no title dump, no https links, max 2 allowed hashtags. */
export function buildFacebookPhotoCaption(payload: SocialPublishPayload): string {
  const summary = (payload.description ?? '').trim() || payload.title
  const body = rewriteAwayFromTitle(summary, payload.title)
  const city = resolveCityLabel(payload)
  const tags = allowedHashtags(payload.hashtags)

  let caption = `${body}\n\n📍 ${city}`
  if (tags.length) caption += `\n\n${tags.join(' ')}`
  // Safety: never leave a URL in caption
  return stripUrls(caption).replace(/\n{3,}/g, '\n\n').trim()
}

// ── Image gate ───────────────────────────────────────────────────────────────

async function validatePublicImage(
  imageUrl: string,
): Promise<{ ok: true; url: string; width: number } | { ok: false; reason: string }> {
  const url = imageUrl.trim()
  if (!url || !/^https?:\/\//i.test(url)) {
    return { ok: false, reason: 'Facebook: image_url yok — atlandı' }
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(18_000),
      headers: {
        'User-Agent': GRAPH_UA,
        Accept: 'image/*,*/*',
      },
    })
    if (!res.ok) {
      return { ok: false, reason: `Facebook: görsel indirilemedi (HTTP ${res.status}) — atlandı` }
    }
    const ctype = (res.headers.get('content-type') || '').toLowerCase()
    if (ctype.includes('text/html') || ctype.includes('application/json')) {
      return { ok: false, reason: 'Facebook: görsel URL geçersiz içerik türü — atlandı' }
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length < 200) {
      return { ok: false, reason: 'Facebook: görsel bozuk/çok küçük — atlandı' }
    }
    const meta = await sharp(buf, { failOn: 'none' }).metadata()
    const width = meta.width ?? 0
    if (!width || width < MIN_IMAGE_WIDTH) {
      return {
        ok: false,
        reason: `Facebook: görsel genişliği yetersiz (${width || 0}px < ${MIN_IMAGE_WIDTH}px) — atlandı`,
      }
    }
    return { ok: true, url, width }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, reason: `Facebook: görsel kontrolü başarısız (${msg}) — atlandı` }
  }
}

// ── Graph helpers ────────────────────────────────────────────────────────────

async function addDetailComment(
  accessToken: string,
  postId: string,
  articleUrl: string,
  commentOpener = 'Haberin detayı:',
): Promise<void> {
  const opener = (commentOpener || 'Haberin detayı:').replace(/https?:\/\/\S+/gi, '').trim() || 'Haberin detayı:'
  const message = `${opener} ${articleUrl}\n\nKaynak: onyeditivi.com`
  try {
    const res = await fetch(`${GRAPH_BASE}/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': GRAPH_UA,
      },
      body: JSON.stringify({
        message,
        access_token: accessToken,
      }),
    })
    const json = (await res.json().catch(() => ({}))) as {
      id?: string
      error?: { message?: string; code?: number }
    }
    if (res.ok && !json.error) {
      console.log(`[facebook] detail comment ok post_id=${postId} comment_id=${json.id ?? '?'}`)
    } else {
      console.error(
        `[facebook] detail comment failed post_id=${postId}:`,
        json.error ?? { status: res.status },
      )
    }
  } catch (err) {
    console.error(`[facebook] detail comment error post_id=${postId}:`, err)
  }
}

/**
 * Publish a single photo to the Page.
 * Uses /{page-id}/photos only — never /feed.
 */
async function publishPhotoPost(
  pageId: string,
  accessToken: string,
  newsId: string,
  imageUrl: string,
  caption: string,
): Promise<SocialPublishResult & { raw?: unknown }> {
  const body: Record<string, unknown> = {
    url: imageUrl,
    caption,
    published: true,
    privacy: JSON.stringify({ value: 'EVERYONE' }),
    access_token: accessToken,
  }

  console.log(`[facebook] photos POST news=${newsId} page=${pageId}`)
  const res = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': GRAPH_UA,
    },
    body: JSON.stringify(body),
  })

  const json = (await res.json()) as {
    id?: string
    post_id?: string
    error?: { message?: string; code?: number; type?: string; error_user_msg?: string }
  }

  console.log(`[facebook] photos response news=${newsId}:`, JSON.stringify(json))

  if (!res.ok || json.error || !json.id) {
    const msg = json.error?.message ?? `HTTP ${res.status}`
    console.error(`[facebook] publish failed news=${newsId}:`, json.error ?? msg)
    return { success: false, error: msg, raw: json }
  }

  // Prefer post_id for comments (Page photo id ≠ feed post id in some responses)
  const platformId = json.post_id || json.id
  console.log(
    `[facebook] published news=${newsId} post_id=${platformId} photo_id=${json.id}`,
  )
  return { success: true, platformId, raw: json }
}

// ── Story (unchanged path; keep IG/FB stories working) ───────────────────────

/**
 * Facebook Hikaye yayınla.
 * 1) Fotoğrafı unpublished yükle → photo_id
 * 2) POST /{pageId}/photo_stories
 */
export async function publishFacebookStory(
  payload: SocialPublishPayload,
): Promise<SocialPublishResult> {
  const creds = await resolveFacebookCredentials(PRIMARY_FACEBOOK_SITE_ID)
  const pageId = creds.pageId
  const accessToken = creds.accessToken

  if (!pageId || !accessToken) {
    return { success: false, error: 'FACEBOOK_PAGE_ID veya FACEBOOK_PAGE_ACCESS_TOKEN eksik' }
  }
  if (!payload.imageUrl?.trim()) {
    return { success: false, error: 'Facebook Hikaye için görsel URL gerekli' }
  }

  const imageUrl = payload.imageUrl.trim()
  const articleUrl = payload.articleUrl?.trim() || undefined

  try {
    const uploadParams = new URLSearchParams({
      url: imageUrl,
      published: 'false',
      access_token: accessToken,
    })
    const uploadRes = await fetch(`${GRAPH_BASE}/${pageId}/photos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': GRAPH_UA,
      },
      body: uploadParams.toString(),
    })
    const uploadJson = (await uploadRes.json()) as { id?: string; error?: { message?: string } }
    if (!uploadRes.ok || uploadJson.error || !uploadJson.id) {
      console.warn(
        `[facebook] story unpublished upload failed (${payload.newsId}): ` +
          `${uploadJson.error?.message ?? uploadRes.status} — url fallback`,
      )
      return await publishFacebookStoryViaUrl(pageId, accessToken, payload.newsId, imageUrl, articleUrl)
    }

    const photoId = uploadJson.id
    const platformId = await publishPhotoStoryWithOptionalLink(
      pageId,
      accessToken,
      payload.newsId,
      photoId,
      articleUrl,
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
  articleUrl?: string,
): Promise<string> {
  const tryPublish = async (withLink: boolean) => {
    const params = new URLSearchParams({
      photo_id: photoId,
      access_token: accessToken,
    })
    if (withLink && articleUrl) params.set('link', articleUrl)

    const res = await fetch(`${GRAPH_BASE}/${pageId}/photo_stories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': GRAPH_UA,
      },
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

async function publishFacebookStoryViaUrl(
  pageId: string,
  accessToken: string,
  newsId: string,
  imageUrl: string,
  articleUrl?: string,
): Promise<SocialPublishResult> {
  const tryOnce = async (withLink: boolean) => {
    const params = new URLSearchParams({
      url: imageUrl,
      access_token: accessToken,
    })
    if (withLink && articleUrl) params.set('link', articleUrl)
    const res = await fetch(`${GRAPH_BASE}/${pageId}/photo_stories`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': GRAPH_UA,
      },
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

// ── Main feed publish ────────────────────────────────────────────────────────

/**
 * Publish a photo post to the Facebook Page.
 * Skips (success:false) when image missing/narrow/broken or rate-limited.
 */
export async function publishToFacebook(
  payload: SocialPublishPayload,
): Promise<SocialPublishResult> {
  const creds = await resolveFacebookCredentials(PRIMARY_FACEBOOK_SITE_ID)
  const pageId = creds.pageId
  const accessToken = creds.accessToken

  if (!pageId || !accessToken) {
    const err = 'FACEBOOK_PAGE_ID veya FACEBOOK_PAGE_ACCESS_TOKEN eksik'
    console.error(`[facebook] ${err}`)
    return { success: false, error: err }
  }

  console.log(
    `[facebook] publish mode=${creds.mode} site=${creds.siteId} app=${creds.appName ?? creds.appId ?? '?'} news=${payload.newsId}`,
  )

  // Deferred queue (hourly overflow)
  try {
    const db = getAdminFirestore()
    const doc = await db.collection(Collections.NEWS).doc(payload.newsId).get()
    const deferredUntil = doc.exists
      ? (doc.data() as Record<string, unknown>).facebookDeferredUntil
      : undefined
    const untilMs =
      typeof deferredUntil === 'number'
        ? deferredUntil
        : deferredUntil && typeof (deferredUntil as { toMillis?: () => number }).toMillis === 'function'
          ? (deferredUntil as { toMillis: () => number }).toMillis()
          : 0
    if (untilMs > Date.now()) {
      const msg = `Facebook: kuyruk bekleniyor (deferredUntil=${new Date(untilMs).toISOString()})`
      console.log(`[facebook] ${msg} news=${payload.newsId}`)
      return { success: false, error: msg }
    }
  } catch (err) {
    console.warn(`[facebook] deferred check failed news=${payload.newsId}:`, err)
  }

  const rate = await checkFacebookRateLimit(payload.title)
  if (!rate.allowed) {
    if (rate.deferUntil) {
      try {
        await getAdminFirestore()
          .collection(Collections.NEWS)
          .doc(payload.newsId)
          .update({ facebookDeferredUntil: rate.deferUntil })
      } catch (err) {
        console.warn(`[facebook] could not set facebookDeferredUntil:`, err)
      }
    }
    console.log(`[facebook] rate skip news=${payload.newsId}: ${rate.reason}`)
    return { success: false, error: rate.reason }
  }

  const imageCandidate =
    payload.imageUrl?.trim() ||
    (Array.isArray(payload.imageUrls) ? payload.imageUrls.find((u) => u?.trim())?.trim() : undefined)

  if (!imageCandidate) {
    const msg = 'Facebook: image_url yok — atlandı'
    console.error(`[facebook] ${msg} news=${payload.newsId}`)
    return { success: false, error: msg }
  }

  const imageCheck = await validatePublicImage(imageCandidate)
  if (!imageCheck.ok) {
    console.error(`[facebook] ${imageCheck.reason} news=${payload.newsId}`)
    return { success: false, error: imageCheck.reason }
  }

  const articleUrl = payload.articleUrl?.trim()
  const city = payload.cityName?.trim() || 'Çanakkale'
  const contentForAi = (payload.description ?? '').trim() || payload.title

  // Meta AI rewrite (default ON). Fail/timeout → local caption fallback; still photos endpoint.
  let caption = ''
  let commentOpener = 'Haberin detayı:'
  let aiSource: 'llama' | 'cache' | 'fallback' | 'off' = 'off'
  let aiError: string | undefined
  let aiHashtags: string[] = []
  let cacheKey: string | undefined

  const ai = await rewriteForPlatform(payload.title, contentForAi, city, 'facebook', {
    articleUrl,
    newsId: payload.newsId,
  })

  if (ai.enabled) {
    aiSource = ai.source
    aiError = ai.error
    cacheKey = ai.cacheKey
    aiHashtags = ai.hashtags
    const tagLine = ai.hashtags.length ? `\n\n${ai.hashtags.join(' ')}` : ''
    caption = `${ai.caption}\n\n📍 ${city}${tagLine}`.trim()
    commentOpener = ai.comment_text || 'Haberin detayı:'
  } else {
    caption = buildFacebookPhotoCaption(payload)
  }

  // Safety: never leave https in caption
  caption = caption.replace(/https?:\/\/\S+/gi, '').replace(/www\.\S+/gi, '').replace(/\n{3,}/g, '\n\n').trim()

  try {
    const result = await publishPhotoPost(
      pageId,
      accessToken,
      payload.newsId,
      imageCheck.url,
      caption,
    )

    if (!result.success || !result.platformId) {
      await logAiRewrite({
        newsId: payload.newsId,
        title: payload.title,
        articleUrl,
        ai_caption: caption,
        hashtags: aiHashtags,
        comment_text: commentOpener,
        source: aiSource,
        error: result.error ?? aiError,
        cacheKey,
      }).catch(() => {})
      return result
    }

    await recordFacebookPublish(payload.title, result.platformId)

    try {
      await getAdminFirestore()
        .collection(Collections.NEWS)
        .doc(payload.newsId)
        .update({ facebookDeferredUntil: FieldValue.delete() })
    } catch {
      /* ignore */
    }

    if (articleUrl) {
      await addDetailComment(accessToken, result.platformId, articleUrl, commentOpener)
    } else {
      console.warn(`[facebook] articleUrl eksik — yorum eklenmedi news=${payload.newsId}`)
    }

    await logAiRewrite({
      newsId: payload.newsId,
      title: payload.title,
      articleUrl,
      ai_caption: caption,
      hashtags: aiHashtags,
      comment_text: commentOpener,
      post_id: result.platformId,
      source: aiSource,
      error: aiError,
      cacheKey,
    }).catch(() => {})

    return { success: true, platformId: result.platformId }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[facebook] unexpected error news=${payload.newsId}:`, err)
    return { success: false, error: msg }
  }
}

// ── Manual test helper ───────────────────────────────────────────────────────

function extractImageUrl(data: Record<string, unknown>): string | undefined {
  for (const key of ['thumbnail', 'coverImageUrl', 'imageUrl', 'featuredImage', 'image']) {
    const v = data[key]
    if (typeof v === 'string' && v.trim().length > 10) return v.trim()
  }
  return undefined
}

function buildArticleUrl(id: string, data: Record<string, unknown>): string {
  const base = getSiteUrl()
  if (typeof data.url === 'string' && data.url.trim()) {
    return data.url
      .trim()
      .replace('nahaber.vercel.app', 'www.nahaber.com')
      .replace('https://nahaber.com', 'https://www.nahaber.com')
  }
  if (typeof data.slug === 'string' && data.slug.trim()) {
    return `${base}${ROUTES.NEWS_DETAIL(data.slug.trim())}`
  }
  return `${base}${ROUTES.POST_DETAIL(id)}`
}

/**
 * Manual Facebook-only test for a news document.
 * Builds payload from Firestore and calls publishToFacebook.
 *
 * Usage:
 *   - API: POST /api/admin/social/test-facebook  { "newsId": "..." }
 *   - CLI: npx tsx scripts/test-facebook-post.ts <newsId>
 */
export async function testFacebookPost(
  newsId: string,
): Promise<
  SocialPublishResult & {
    newsId: string
    title?: string
    caption?: string
    imageUrl?: string
    ai?: unknown
    credentialMode?: string
    appId?: string | null
    appName?: string | null
    attributionHint?: string
  }
> {
  const id = newsId.trim()
  if (!id) {
    return { success: false, error: 'newsId zorunlu', newsId: '' }
  }

  const db = getAdminFirestore()
  const snap = await db.collection(Collections.NEWS).doc(id).get()
  if (!snap.exists) {
    return { success: false, error: `Haber bulunamadı: ${id}`, newsId: id }
  }

  const data = snap.data() as Record<string, unknown>
  const title = typeof data.title === 'string' ? data.title : ''
  if (!title) {
    return { success: false, error: 'Haber başlığı yok', newsId: id }
  }

  const spot =
    typeof data.spot === 'string'
      ? data.spot
      : typeof data.summary === 'string'
        ? data.summary
        : typeof data.description === 'string'
          ? data.description
          : ''
  const cityName = typeof data.cityName === 'string' ? data.cityName : 'Çanakkale'
  const citySlug = typeof data.citySlug === 'string' ? data.citySlug : 'canakkale'
  const coverImage = extractImageUrl(data)
  const articleUrl = buildArticleUrl(id, data)

  let socialContent = await generateSocialContent(title, spot, cityName)
  if (!socialContent) {
    socialContent = {
      headline: clampCompleteHeadline(title, 78),
      storySummary: spot ? clampCompleteSentences(spot, 200, 232) : `${clampAtWordBoundary(title, 120)}.`,
      caption: spot || title,
      hashtags: ['#Çanakkale', '#SonDakika'],
      altText: title,
    }
  }

  const socialImageUrl = buildOgSocialUrl(id, {
    title,
    socialHeadline: socialContent.headline,
    socialStorySummary: socialContent.storySummary,
    imageUrl: coverImage,
  })
  const imagePayload = await buildSocialImagePayload(id, socialImageUrl, data, {
    fallbackImageUrl: coverImage,
  })

  const payload: SocialPublishPayload = {
    newsId: id,
    title,
    description: socialContent.caption || spot || title,
    imageUrl: imagePayload.imageUrl,
    articleUrl,
    hashtags: socialContent.hashtags,
    cityName,
    citySlug,
  }

  // Preview Meta AI output before posting (also warms 24h cache)
  const aiPreview = await rewriteForSocial(title, socialContent.caption || spot || title, cityName, {
    articleUrl,
    newsId: id,
  })
  const caption =
    `${aiPreview.caption}\n\n📍 ${cityName}` +
    (aiPreview.hashtags.length ? `\n\n${aiPreview.hashtags.join(' ')}` : '')
  console.log(
    `[facebook] testFacebookPost news=${id} ai=${aiPreview.source} caption=\n${caption}`,
  )
  await logAiRewrite({
    newsId: id,
    title,
    articleUrl,
    ai_caption: caption,
    hashtags: aiPreview.hashtags,
    comment_text: aiPreview.comment_text,
    source: `test:${aiPreview.source}`,
    error: aiPreview.error,
    cacheKey: aiPreview.cacheKey,
  }).catch(() => {})

  const result = await publishToFacebook(payload)
  const creds = await resolveFacebookCredentials(PRIMARY_FACEBOOK_SITE_ID)

  if (result.success && result.platformId) {
    await db
      .collection(Collections.NEWS)
      .doc(id)
      .update({
        facebookPostId: result.platformId,
        socialImageUrl: imagePayload.imageUrl || socialImageUrl,
        socialCaption: socialContent.caption,
        socialHashtags: socialContent.hashtags,
      })
      .catch((err) => console.warn('[facebook] testFacebookPost firestore update:', err))
  }

  return {
    ...result,
    newsId: id,
    title,
    caption,
    imageUrl: imagePayload.imageUrl,
    credentialMode: creds.mode,
    appId: creds.appId,
    appName: creds.appName,
    attributionHint:
      creds.mode === 'custom'
        ? `Post altında "${creds.appName || 'App'} paylaştı" görünmeli (kendi app).`
        : 'Global app kullanıldı — etikette "Publisher" / eski "NaHaber Social Publisher" görünebilir. BYO app bağlayın.',
    ai: {
      source: aiPreview.source,
      caption: aiPreview.caption,
      hashtags: aiPreview.hashtags,
      comment_text: aiPreview.comment_text,
      error: aiPreview.error,
    },
  }
}
