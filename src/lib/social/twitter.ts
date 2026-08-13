/**
 * Twitter / X API v2 — OAuth 1.0a ile tweet gönderme
 * Harici bağımlılık gerektirmez; Node.js crypto modülü kullanır.
 */
import crypto from 'crypto'
import type { SocialPublishPayload, SocialPublishResult } from './types'
import { clampAtWordBoundary } from './feedCaption'
import { rewriteForPlatform } from '@/services/metaAiRewriteService'

// ── OAuth 1.0a yardımcıları ────────────────────────────────────────────────

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, '%21')
    .replace(/\*/g, '%2A')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
}

function buildBaseString(method: string, url: string, params: Record<string, string>): string {
  const sorted = Object.keys(params)
    .sort()
    .map(k => `${percentEncode(k)}=${percentEncode(params[k])}`)
    .join('&')
  return [method.toUpperCase(), percentEncode(url), percentEncode(sorted)].join('&')
}

function buildSigningKey(apiSecret: string, tokenSecret: string): string {
  return `${percentEncode(apiSecret)}&${percentEncode(tokenSecret)}`
}

function generateSignature(baseString: string, signingKey: string): string {
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64')
}

function buildAuthHeader(params: Record<string, string>): string {
  const oauthParams = Object.keys(params)
    .filter(k => k.startsWith('oauth_'))
    .sort()
    .map(k => `${percentEncode(k)}="${percentEncode(params[k])}"`)
    .join(', ')
  return `OAuth ${oauthParams}`
}

function generateOAuthHeader(
  method: string,
  url: string,
  bodyParams: Record<string, string>,
  credentials: {
    apiKey: string
    apiSecret: string
    accessToken: string
    accessTokenSecret: string
  }
): string {
  const nonce = crypto.randomBytes(16).toString('hex')
  const timestamp = Math.floor(Date.now() / 1000).toString()

  const oauthParams: Record<string, string> = {
    oauth_consumer_key:     credentials.apiKey,
    oauth_nonce:            nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp:        timestamp,
    oauth_token:            credentials.accessToken,
    oauth_version:          '1.0',
  }

  // İmza için hem oauth hem body params birleştirilir
  const allParams = { ...bodyParams, ...oauthParams }
  const baseString = buildBaseString(method, url, allParams)
  const signingKey = buildSigningKey(credentials.apiSecret, credentials.accessTokenSecret)
  const signature = generateSignature(baseString, signingKey)

  return buildAuthHeader({ ...oauthParams, oauth_signature: signature })
}

// ── Tweet metni oluştur ────────────────────────────────────────────────────

/** Tweet metnini X karakter sınırına göre kırp (280 karakter) */
function buildTweetText(payload: SocialPublishPayload, bodyOverride?: string): string {
  const url = payload.articleUrl ?? ''
  // URL her zaman 23 karakter sayılır (t.co shortening)
  const urlLength = url ? 24 : 0 // 23 + 1 boşluk
  const maxText = 280 - urlLength

  const tags =
    payload.hashtags?.length
      ? payload.hashtags
          .map((t) => {
            const s = String(t).trim()
            return s.startsWith('#') ? s : `#${s}`
          })
          .slice(0, 3)
          .join(' ')
      : '#NaHaber #Çanakkale #SonDakika'
  const separator = '\n\n'
  const available = Math.max(40, maxText - tags.length - separator.length * (url ? 2 : 1))

  let body = (bodyOverride ?? payload.description ?? payload.title).replace(/\s+/g, ' ').trim()
  if (body.length > available) {
    body = clampAtWordBoundary(body, available - 1)
  }

  if (url) return `${body}${separator}${tags}\n\n${url}`
  return `${body}${separator}${tags}`
}

// ── Ana yayın fonksiyonu ───────────────────────────────────────────────────

export async function publishToTwitter(
  payload: SocialPublishPayload
): Promise<SocialPublishResult> {
  const apiKey           = process.env.X_API_KEY?.trim()
  const apiSecret        = process.env.X_API_SECRET?.trim()
  const accessToken      = process.env.X_ACCESS_TOKEN?.trim()
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET?.trim()

  if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
    const missing = [
      !apiKey           && 'X_API_KEY',
      !apiSecret        && 'X_API_SECRET',
      !accessToken      && 'X_ACCESS_TOKEN',
      !accessTokenSecret && 'X_ACCESS_TOKEN_SECRET',
    ].filter(Boolean).join(', ')
    return { success: false, error: `X credentials eksik: ${missing}` }
  }

  // Meta AI: özgün caption (280 limit). Fail → başlık/description fallback.
  let tweetBody: string | undefined
  let tweetPayload = payload
  const city = payload.cityName?.trim() || 'Çanakkale'
  const contentForAi = (payload.description ?? '').trim() || payload.title
  const ai = await rewriteForPlatform(payload.title, contentForAi, city, 'twitter', {
    articleUrl: payload.articleUrl,
    newsId: payload.newsId,
  })
  if (ai.enabled) {
    tweetBody = ai.caption
    if (ai.hashtags.length) {
      tweetPayload = { ...payload, hashtags: ai.hashtags }
    }
  }

  const tweetText = buildTweetText(tweetPayload, tweetBody)
  const url = 'https://api.twitter.com/2/tweets'
  const body = JSON.stringify({ text: tweetText })

  // application/json body için OAuth imzası yalnızca oauth_ parametrelerini içerir
  // (JSON body imzaya dahil edilmez — sadece form-urlencoded dahil edilir)
  const authHeader = generateOAuthHeader(
    'POST',
    url,
    {}, // JSON body oauth imzasına dahil edilmez
    { apiKey, apiSecret, accessToken, accessTokenSecret }
  )

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
      body,
    })

    const data = await res.json() as Record<string, unknown>

    if (res.ok && data.data) {
      const tweetData = data.data as Record<string, unknown>
      const tweetId = typeof tweetData.id === 'string' ? tweetData.id : undefined
      console.log(`[twitter] Tweet yayınlandı — id: ${tweetId}`)
      return { success: true, platformId: tweetId }
    }

    // Hata durumu
    const errDetail = JSON.stringify(data).slice(0, 300)
    console.error(`[twitter] API hatası ${res.status}: ${errDetail}`)
    return { success: false, error: `HTTP ${res.status}: ${errDetail}` }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[twitter] fetch hatası:', msg)
    return { success: false, error: msg }
  }
}
