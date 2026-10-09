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
import { FACEBOOK_GRAPH_BASE } from './graphConfig'
import { errorLogFields, platformError, safeErrorText, socialLog } from './safeLog'
import type { FacebookPublishTarget } from './accounts/targetTypes'
import { INVALID_TARGET_ERROR, isUsableFacebookTarget } from './accounts/targetGuards'
import { PRIMARY_FACEBOOK_SITE_ID } from './facebookAppStore'
import {
  checkFacebookRateLimit,
  recordFacebookPublish,
} from './facebookRateLimit'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { FieldValue } from 'firebase-admin/firestore'
import { buildPublicArticleUrl, isPublicShareArticleUrl } from '@/lib/social/articleUrl'
import { buildSocialImagePayload } from './carouselImages'
import { buildOgSocialUrl } from './ogCacheVersion'
import { clampAtWordBoundary, clampCompleteSentences, overlayHeadlineFromTitle } from './feedCaption'
import { isGarbledSocialCopy, repairSocialCopyAgainstSource } from './socialFactualFidelity'
import { generateSocialContent } from './aiSocialEditor'
import { rewriteForSocial, rewriteForPlatform, logAiRewrite } from '@/services/metaAiRewriteService'
import { withLegacyPublishLock, type LegacyPublishOptions, type LockedPublishResult } from './accounts/legacyLock'
import { singleImageGuard } from './imagePolicy'

const GRAPH_BASE = FACEBOOK_GRAPH_BASE
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
    return { ok: false, reason: `Facebook: görsel kontrolü başarısız (${safeErrorText(err)}) — atlandı` }
  }
}

// ── Graph helpers ────────────────────────────────────────────────────────────

async function addDetailComment(
  accessToken: string,
  postId: string,
  articleUrl: string,
  commentOpener = 'Haberin detayı:',
  /** Onyeditivi attribution line; null for non-Onyeditivi target accounts. */
  sourceLine: string | null = 'Kaynak: onyeditivi.com',
): Promise<void> {
  const opener = (commentOpener || 'Haberin detayı:').replace(/https?:\/\/\S+/gi, '').trim() || 'Haberin detayı:'
  const message = sourceLine ? `${opener} ${articleUrl}\n\n${sourceLine}` : `${opener} ${articleUrl}`
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
      socialLog('log', 'facebook', 'detail_comment', { result: 'ok', postId, commentId: json.id ?? null })
    } else {
      socialLog('error', 'facebook', 'detail_comment', { result: 'failed', postId, ...errorLogFields(platformError('facebook', 'yorum', res.status, json)) })
    }
  } catch (err) {
    socialLog('error', 'facebook', 'detail_comment', { result: 'exception', postId, ...errorLogFields(err) })
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
): Promise<SocialPublishResult> {
  const body: Record<string, unknown> = {
    url: imageUrl,
    caption,
    published: true,
    privacy: JSON.stringify({ value: 'EVERYONE' }),
    access_token: accessToken,
  }

  socialLog('log', 'facebook', 'photos', { corr: newsId, pageId, result: 'request' })
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

  if (!res.ok || json.error || !json.id) {
    const err = platformError('facebook', 'fotoğraf paylaşımı', res.status, json)
    socialLog('error', 'facebook', 'photos', { corr: newsId, pageId, result: 'failed', ...errorLogFields(err) })
    return { success: false, error: err.message }
  }

  // Prefer post_id for comments (Page photo id ≠ feed post id in some responses)
  const platformId = json.post_id || json.id
  socialLog('log', 'facebook', 'photo_post', { corr: newsId, result: 'published', postId: platformId })
  return { success: true, platformId }
}

// ── Story (unchanged path; keep IG/FB stories working) ───────────────────────

/**
 * Facebook Hikaye yayınla.
 * 1) Fotoğrafı unpublished yükle → photo_id
 * 2) POST /{pageId}/photo_stories
 */
async function publishFacebookStoryUnlocked(
  payload: SocialPublishPayload,
  /** Optional explicit account. Omitted → legacy Onyeditivi credentials (unchanged). */
  target?: FacebookPublishTarget,
): Promise<SocialPublishResult> {
  if (target !== undefined && !isUsableFacebookTarget(target)) {
    socialLog('error', 'facebook', 'story', { corr: payload.newsId, result: 'invalid_target' })
    return { success: false, error: INVALID_TARGET_ERROR }
  }
  let pageId: string
  let accessToken: string
  if (target) {
    pageId = target.pageId
    accessToken = target.accessToken
    socialLog('log', 'facebook', 'story', { corr: payload.newsId, account: target.accountId, method: target.connectionMethod })
  } else {
    const creds = await resolveFacebookCredentials(PRIMARY_FACEBOOK_SITE_ID)
    pageId = creds.pageId
    accessToken = creds.accessToken
  }

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
      socialLog('warn', 'facebook', 'story_upload', {
        corr: payload.newsId,
        result: 'failed_url_fallback',
        ...errorLogFields(platformError('facebook', 'hikâye yükleme', uploadRes.status, uploadJson)),
      })
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
    socialLog('log', 'facebook', 'story', { corr: payload.newsId, result: 'published', postId: platformId })
    return { success: true, platformId }
  } catch (err) {
    socialLog('error', 'facebook', 'story', { corr: payload.newsId, result: 'failed', ...errorLogFields(err) })
    return { success: false, error: safeErrorText(err) }
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
      throw platformError('facebook', 'hikâye paylaşımı', res.status, json)
    }
    return json.post_id ?? json.id ?? photoId
  }

  if (articleUrl) {
    try {
      const id = await tryPublish(true)
      socialLog('log', 'facebook', 'story_link', { corr: newsId, result: 'attached' })
      return id
    } catch (linkErr) {
      socialLog('warn', 'facebook', 'story_link', { corr: newsId, result: 'rejected_retry_without_link', ...errorLogFields(linkErr) })
    }
  } else {
    socialLog('warn', 'facebook', 'story_link', { corr: newsId, result: 'no_article_url' })
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
      throw platformError('facebook', 'hikâye paylaşımı', res.status, json)
    }
    return json.post_id ?? json.id
  }

  try {
    let platformId: string | undefined
    if (articleUrl) {
      try {
        platformId = await tryOnce(true)
        socialLog('log', 'facebook', 'story_link', { corr: newsId, result: 'attached', via: 'url' })
      } catch (linkErr) {
        socialLog('warn', 'facebook', 'story_link', { corr: newsId, result: 'rejected_retry_without_link', ...errorLogFields(linkErr) })
        platformId = await tryOnce(false)
      }
    } else {
      platformId = await tryOnce(false)
    }
    socialLog('log', 'facebook', 'story', { corr: newsId, result: 'published', via: 'url', postId: platformId ?? null })
    return { success: true, platformId }
  } catch (err) {
    socialLog('error', 'facebook', 'story', { corr: newsId, result: 'failed', ...errorLogFields(err) })
    return { success: false, error: safeErrorText(err) }
  }
}

// ── Main feed publish ────────────────────────────────────────────────────────

/**
 * Publish a photo post to the Facebook Page.
 * Skips (success:false) when image missing/narrow/broken or rate-limited.
 */
async function publishToFacebookUnlocked(
  payload: SocialPublishPayload,
  /** Optional explicit account. Omitted → legacy Onyeditivi credentials (unchanged). */
  target?: FacebookPublishTarget,
): Promise<SocialPublishResult> {
  if (target !== undefined && !isUsableFacebookTarget(target)) {
    socialLog('error', 'facebook', 'photo_post', { corr: payload.newsId, result: 'invalid_target' })
    return { success: false, error: INVALID_TARGET_ERROR }
  }

  let pageId: string
  let accessToken: string
  let credMeta: Pick<SocialPublishResult, 'credentialMode' | 'appId' | 'appName'>
  /**
   * Onyeditivi page (no target, or its legacy account record): keep the
   * page-level hourly limiter, deferral and news-doc credential fields.
   * Other accounts get per-account limits in the queue task, not this limiter.
   */
  const legacyPage = !target || target.connectionMethod === 'legacy'

  if (target) {
    pageId = target.pageId
    accessToken = target.accessToken
    credMeta = {
      ...(target.legacyCredentialMode ? { credentialMode: target.legacyCredentialMode } : {}),
      appId: target.appId,
      appName: target.appName,
    }
    socialLog('log', 'facebook', 'photo_post', { corr: payload.newsId, account: target.accountId, method: target.connectionMethod })
  } else {
    const creds = await resolveFacebookCredentials(PRIMARY_FACEBOOK_SITE_ID)
    pageId = creds.pageId
    accessToken = creds.accessToken

    credMeta = {
      credentialMode: creds.mode,
      appId: creds.appId,
      appName: creds.appName,
    }

    if (!pageId || !accessToken) {
      const err =
        creds.mode === 'custom'
          ? 'BYO Facebook pageId/token eksik'
          : 'FACEBOOK_PAGE_ID veya FACEBOOK_PAGE_ACCESS_TOKEN eksik'
      socialLog('error', 'facebook', 'photo_post', { corr: payload.newsId, result: 'credentials_missing', mode: creds.mode })
      return { success: false, error: err, ...credMeta }
    }

    socialLog('log', 'facebook', 'photo_post', { corr: payload.newsId, mode: creds.mode, source: creds.source, site: creds.siteId, appId: creds.appId ?? 'none' })
  }

  // Deferred queue (hourly overflow) — Onyeditivi page only
  if (legacyPage) try {
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
      socialLog('log', 'facebook', 'photo_post', { corr: payload.newsId, result: 'deferred' })
      return { success: false, error: msg, ...credMeta }
    }
  } catch (err) {
    socialLog('warn', 'facebook', 'deferred_check', { corr: payload.newsId, result: 'failed', ...errorLogFields(err) })
  }

  const rate = legacyPage ? await checkFacebookRateLimit(payload.title) : { allowed: true as const }
  if (!rate.allowed) {
    if (rate.deferUntil) {
      try {
        await getAdminFirestore()
          .collection(Collections.NEWS)
          .doc(payload.newsId)
          .update({ facebookDeferredUntil: rate.deferUntil })
      } catch (err) {
        socialLog('warn', 'facebook', 'deferred_set', { corr: payload.newsId, result: 'failed', ...errorLogFields(err) })
      }
    }
    socialLog('log', 'facebook', 'photo_post', { corr: payload.newsId, result: 'rate_limited' })
    return { success: false, error: rate.reason, ...credMeta }
  }

  const imageCandidate =
    payload.imageUrl?.trim() ||
    (Array.isArray(payload.imageUrls) ? payload.imageUrls.find((u) => u?.trim())?.trim() : undefined)

  if (!imageCandidate) {
    const msg = 'Facebook: image_url yok — atlandı'
    socialLog('error', 'facebook', 'photo_post', { corr: payload.newsId, result: 'no_image' })
    return { success: false, error: msg, ...credMeta }
  }

  const imageCheck = await validatePublicImage(imageCandidate)
  if (!imageCheck.ok) {
    socialLog('error', 'facebook', 'photo_post', { corr: payload.newsId, result: 'image_rejected' })
    return { success: false, error: imageCheck.reason, ...credMeta }
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
      return { ...result, ...credMeta }
    }

    if (legacyPage) await recordFacebookPublish(payload.title, result.platformId)

    if (legacyPage) try {
      await getAdminFirestore()
        .collection(Collections.NEWS)
        .doc(payload.newsId)
        .update({
          facebookDeferredUntil: FieldValue.delete(),
          facebookAppId: credMeta.appId ?? null,
          facebookCredentialMode: credMeta.credentialMode,
        })
    } catch {
      /* ignore */
    }

    if (articleUrl) {
      await addDetailComment(
        accessToken,
        result.platformId,
        articleUrl,
        commentOpener,
        legacyPage ? undefined : null,
      )
    } else {
      socialLog('warn', 'facebook', 'detail_comment', { corr: payload.newsId, result: 'no_article_url' })
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

    socialLog('log', 'facebook', 'photo_post', { corr: payload.newsId, result: 'ok', postId: result.platformId, mode: credMeta.credentialMode ?? 'target', appId: credMeta.appId ?? 'none' })
    return { success: true, platformId: result.platformId, ...credMeta }
  } catch (err) {
    socialLog('error', 'facebook', 'publish', { corr: payload.newsId, result: 'exception', ...errorLogFields(err) })
    return { success: false, error: safeErrorText(err), ...credMeta }
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

function buildArticleUrl(id: string, data: Record<string, unknown>): string | null {
  const url = buildPublicArticleUrl(id, data)
  return url && isPublicShareArticleUrl(url) ? url : null
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
  if (!articleUrl) {
    return {
      success: false,
      error: 'Public article URL yok (taslak slug) — Facebook testi engellendi',
      newsId: id,
      title,
    }
  }

  let socialContent = await generateSocialContent(title, spot, cityName)
  if (!socialContent) {
    socialContent = {
      headline: overlayHeadlineFromTitle(title),
      storySummary: spot ? clampCompleteSentences(spot, 200, 232) : `${clampAtWordBoundary(title, 120)}.`,
      caption: spot || title,
      hashtags: ['#Çanakkale', '#SonDakika'],
      altText: title,
    }
  }
  socialContent.headline = overlayHeadlineFromTitle(title)
  socialContent.storySummary = repairSocialCopyAgainstSource(socialContent.storySummary, title, spot)
  if (isGarbledSocialCopy(socialContent.storySummary)) {
    socialContent.storySummary = spot
      ? clampCompleteSentences(spot, 200, 232)
      : `${clampAtWordBoundary(title, 120)}.`
  }
  socialContent.caption = repairSocialCopyAgainstSource(socialContent.caption, title, spot)
  if (isGarbledSocialCopy(socialContent.caption)) {
    socialContent.caption = spot ? `📰 ${title}\n\n${spot.trim()}` : `📰 ${title}`
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
    platform: 'facebook',
  })
  const caption =
    `${aiPreview.caption}\n\n📍 ${cityName}` +
    (aiPreview.hashtags.length ? `\n\n${aiPreview.hashtags.join(' ')}` : '')
  socialLog('log', 'facebook', 'test_post', { corr: id, ai: aiPreview.source, captionLength: caption.length })
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

  const result = await publishToFacebook(payload, undefined, { trigger: 'test_facebook' })
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
      .catch((err) => socialLog('warn', 'facebook', 'test_post_update', { corr: id, ...errorLogFields(err) }))
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

// ── Shared publish lock (legacy path) ──────────────────────────────────────────

/**
 * publishToFacebook — explicit target: the caller (publishToTarget) already holds the
 * account-scoped ledger claim. No target: legacy Onyeditivi credentials,
 * guarded by the shared ledger lock (see accounts/legacyLock.ts).
 */
export async function publishToFacebook(
  payload: SocialPublishPayload,
  target?: FacebookPublishTarget,
  legacy?: LegacyPublishOptions,
): Promise<LockedPublishResult> {
  // Tek görsel uygulanır: kaydırmalı istek ya da açık 'single' seçimi olmayan
  // çoklu görsel, medya hazırlığı/kilit/platform isteğinden ÖNCE reddedilir —
  // sessizce ilk görsele düşürülmez (bkz. imagePolicy.ts).
  const imageBlock = singleImageGuard(payload, 'facebook')
  if (imageBlock) return imageBlock
  if (target !== undefined) return publishToFacebookUnlocked(payload, target)
  return withLegacyPublishLock(
    { platform: 'facebook', format: 'post', newsId: payload.newsId, options: legacy },
    () => publishToFacebookUnlocked(payload),
  )
}

/**
 * publishFacebookStory — explicit target: the caller (publishToTarget) already holds the
 * account-scoped ledger claim. No target: legacy Onyeditivi credentials,
 * guarded by the shared ledger lock (see accounts/legacyLock.ts).
 */
export async function publishFacebookStory(
  payload: SocialPublishPayload,
  target?: FacebookPublishTarget,
  legacy?: LegacyPublishOptions,
): Promise<LockedPublishResult> {
  if (target !== undefined) return publishFacebookStoryUnlocked(payload, target)
  return withLegacyPublishLock(
    { platform: 'facebook', format: 'story', newsId: payload.newsId, options: legacy },
    () => publishFacebookStoryUnlocked(payload),
  )
}
