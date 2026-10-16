/**
 * YouTube Shorts adapter for the rendered NaHaber news reel (1080×1920 MP4).
 *
 * YouTube does not pull a video from a URL (unlike Meta): the MP4 is read from
 * NaHaber's own Storage and sent with a resumable `videos.insert` upload:
 *
 *   1. POST  /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status
 *            (metadata JSON) → `Location` = upload session URI
 *   2. PUT   <session URI>  (the MP4 bytes, one request — reels are small)
 *            → 200/201 + video resource (id)
 *
 * A vertical video ≤ 3 minutes is shown by YouTube as a Short; there is no
 * separate "Shorts" API.
 *
 * Ledger outcome mapping (classifyOutcome in publishLedger.ts):
 *   - anything before the PUT (download, session start, quota) → FAILED
 *     (nothing reached YouTube); messages deliberately avoid the transport /
 *     server patterns so they are never classified as "uncertain"
 *   - PUT transport error / 5xx → ask the session for its status once
 *       200/201 with an id → succeeded
 *       308 (incomplete)    → failed (YouTube has no finished video)
 *       still unknown       → UNCERTAIN (never re-uploaded automatically)
 *
 * Privacy: YOUTUBE_PRIVACY_STATUS (public | unlisted | private), default
 * `private`. Uploads from an API project that has not passed the YouTube API
 * compliance audit are locked to private by YouTube regardless of the request.
 *
 * Tokens, session URIs and YouTube error messages are never logged.
 */
import type { SocialPublishResult } from './types'
import type { YouTubePublishTarget } from './accounts/targetTypes'
import { INVALID_TARGET_ERROR } from './accounts/targetGuards'
import { YOUTUBE_UPLOAD_URL } from './graphConfig'
import { googleErrorReason } from './accounts/connect/googleOAuth'
import { safeErrorText, socialLog } from './safeLog'

export type YouTubePrivacy = 'public' | 'unlisted' | 'private'

export interface YouTubeShortInput {
  newsId: string
  videoUrl: string
  title: string
  description: string
  tags: string[]
}

/** YouTube «News & Politics». */
export const YOUTUBE_NEWS_CATEGORY_ID = '25'
export const MAX_SHORT_BYTES = 256 * 1024 * 1024
const TITLE_MAX = 100
const DESCRIPTION_MAX = 4900
const TAGS_MAX_CHARS = 450

/** Only NaHaber's own Storage hosts may be downloaded (no arbitrary URL fetch). */
const ALLOWED_VIDEO_HOSTS = new Set(['storage.googleapis.com', 'firebasestorage.googleapis.com'])

export function youtubePrivacy(env: NodeJS.ProcessEnv = process.env): YouTubePrivacy {
  const v = env.YOUTUBE_PRIVACY_STATUS?.trim().toLowerCase()
  return v === 'public' || v === 'unlisted' ? v : 'private'
}

/** YouTube rejects `<` and `>` in titles/descriptions. */
function clean(text: string): string {
  return text.replace(/[<>]/g, '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()
}

function cut(text: string, max: number): string {
  if (text.length <= max) return text
  const head = text.slice(0, max - 1)
  const sp = head.lastIndexOf(' ')
  return `${(sp > max * 0.6 ? head.slice(0, sp) : head).trim()}…`
}

export function youtubeTitle(raw: string): string {
  const t = cut(clean(raw).replace(/\s+/g, ' '), TITLE_MAX)
  return t || 'NaHaber'
}

export function youtubeDescription(raw: string): string {
  return cut(clean(raw), DESCRIPTION_MAX)
}

/** Tags without `#`, deduplicated, total length bounded (YouTube limit ~500 chars). */
export function youtubeTags(raw: string[]): string[] {
  const out: string[] = []
  let total = 0
  for (const t of raw) {
    const tag = clean(t).replace(/^#/, '').replace(/[,"]/g, '').trim().slice(0, 30)
    if (!tag || out.some((x) => x.toLocaleLowerCase('tr') === tag.toLocaleLowerCase('tr'))) continue
    if (total + tag.length + 1 > TAGS_MAX_CHARS) break
    out.push(tag)
    total += tag.length + 1
  }
  return out
}

export function isAllowedVideoUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && ALLOWED_VIDEO_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}

function isUsableYouTubeTarget(t: YouTubePublishTarget | null | undefined): t is YouTubePublishTarget {
  return !!t && t.platform === 'youtube' && /^UC[0-9A-Za-z_-]{22}$/.test(t.channelId) && typeof t.accessToken === 'string' && t.accessToken.length > 0
}

const DEFINITE_TEXT: Record<string, string> = {
  quotaExceeded: 'YouTube günlük API kotası doldu; yarın tekrar denenebilir',
  uploadLimitExceeded: 'Bu kanalın YouTube günlük yükleme sınırı doldu',
  forbidden: 'YouTube bu kanala yükleme izni vermedi',
  insufficientPermissions: 'YouTube yükleme izni eksik — yeniden bağlantı gerekli',
  youtubeSignupRequired: 'Google hesabının YouTube kanalı yok',
  invalidTitle: 'YouTube başlığı reddetti',
  invalidDescription: 'YouTube açıklamayı reddetti',
  invalidTags: 'YouTube etiketleri reddetti',
}

type FetchFn = typeof fetch

/** Download the reel MP4 from NaHaber Storage. */
async function downloadVideo(url: string, fetchFn: FetchFn): Promise<Buffer> {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Reels videosu depodan okunamadı (durum ${res.status})`)
  const len = Number(res.headers.get('content-length') ?? '0')
  if (len > MAX_SHORT_BYTES) throw new Error('Reels videosu YouTube için çok büyük')
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) throw new Error('Reels videosu boş')
  if (buf.length > MAX_SHORT_BYTES) throw new Error('Reels videosu YouTube için çok büyük')
  return buf
}

async function readJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return ((await res.json()) as Record<string, unknown>) ?? {}
  } catch {
    return {}
  }
}

function videoId(body: Record<string, unknown>): string {
  const id = typeof body.id === 'string' ? body.id : ''
  return /^[0-9A-Za-z_-]{6,20}$/.test(id) ? id : ''
}

export async function publishYouTubeShort(
  input: YouTubeShortInput,
  target: YouTubePublishTarget,
  deps: { fetch?: FetchFn; privacy?: YouTubePrivacy } = {},
): Promise<SocialPublishResult> {
  const fetchFn = deps.fetch ?? fetch
  if (!isUsableYouTubeTarget(target)) return { success: false, error: INVALID_TARGET_ERROR }
  if (!isAllowedVideoUrl(input.videoUrl)) return { success: false, error: 'YouTube için NaHaber deposunda bir video gerekli' }
  const token = target.accessToken
  const privacy = deps.privacy ?? youtubePrivacy()

  // ── 1. MP4 + upload session (nothing reaches YouTube on failure) ──────────
  let bytes: Buffer
  try {
    bytes = await downloadVideo(input.videoUrl, fetchFn)
  } catch (err) {
    socialLog('error', 'youtube', 'short_download', { corr: input.newsId, account: target.accountId, result: 'failed' })
    return { success: false, error: safeErrorText(err).replace(/fetch failed|network|timeout|timed out|aborted/gi, 'bağlantı sorunu') }
  }

  const metadata = {
    snippet: {
      title: youtubeTitle(input.title),
      description: youtubeDescription(input.description),
      tags: youtubeTags(input.tags),
      categoryId: YOUTUBE_NEWS_CATEGORY_ID,
      defaultLanguage: 'tr',
      defaultAudioLanguage: 'tr',
    },
    status: { privacyStatus: privacy, selfDeclaredMadeForKids: false, embeddable: true },
  }

  let sessionUri = ''
  try {
    const init = await fetchFn(`${YOUTUBE_UPLOAD_URL}?uploadType=resumable&part=snippet,status`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': 'video/mp4',
        'X-Upload-Content-Length': String(bytes.length),
      },
      body: JSON.stringify(metadata),
      signal: AbortSignal.timeout(30_000),
    })
    if (!init.ok) {
      const reason = googleErrorReason(await readJson(init))
      socialLog('error', 'youtube', 'short_session', { corr: input.newsId, account: target.accountId, status: init.status, reason: reason ?? '-' })
      const text = (reason && DEFINITE_TEXT[reason]) || `YouTube yükleme oturumu açılamadı (durum ${init.status}${reason ? `, ${reason}` : ''})`
      return { success: false, error: text }
    }
    sessionUri = init.headers.get('location') ?? ''
    if (!sessionUri.startsWith('https://')) return { success: false, error: 'YouTube yükleme oturumu adresi alınamadı' }
  } catch {
    socialLog('error', 'youtube', 'short_session', { corr: input.newsId, account: target.accountId, result: 'transport' })
    return { success: false, error: 'YouTube yükleme oturumu açılamadı (bağlantı sorunu); video gönderilmedi' }
  }

  // ── 2. Upload bytes (from here a lost answer is "uncertain") ──────────────
  let put: Response | null = null
  try {
    put = await fetchFn(sessionUri, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'video/mp4', 'Content-Length': String(bytes.length) },
      body: new Uint8Array(bytes),
      signal: AbortSignal.timeout(240_000),
    })
  } catch {
    put = null
  }

  if (put && (put.status === 200 || put.status === 201)) {
    const body = await readJson(put)
    const id = videoId(body)
    if (!id) return { success: true } // no id → ledger records "uncertain" (no_platform_id)
    const st = (body.status ?? {}) as Record<string, unknown>
    socialLog('log', 'youtube', 'short', { corr: input.newsId, account: target.accountId, result: 'published', videoId: id, privacy: typeof st.privacyStatus === 'string' ? st.privacyStatus : privacy })
    return { success: true, platformId: id }
  }
  if (put && put.status >= 400 && put.status < 500) {
    const reason = googleErrorReason(await readJson(put))
    socialLog('error', 'youtube', 'short_upload', { corr: input.newsId, account: target.accountId, status: put.status, reason: reason ?? '-' })
    return { success: false, error: (reason && DEFINITE_TEXT[reason]) || `YouTube videoyu reddetti (durum ${put.status}${reason ? `, ${reason}` : ''})` }
  }

  // Transport error or 5xx: ask the session whether the upload completed.
  try {
    const q = await fetchFn(sessionUri, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Range': `bytes */${bytes.length}`, 'Content-Length': '0' },
      signal: AbortSignal.timeout(20_000),
    })
    if (q.status === 200 || q.status === 201) {
      const id = videoId(await readJson(q))
      if (id) {
        socialLog('log', 'youtube', 'short', { corr: input.newsId, account: target.accountId, result: 'published_after_check', videoId: id })
        return { success: true, platformId: id }
      }
    }
    if (q.status === 308) {
      socialLog('warn', 'youtube', 'short_upload', { corr: input.newsId, account: target.accountId, result: 'incomplete' })
      return { success: false, error: 'YouTube yüklemesi tamamlanmadı; video yayımlanmadı' }
    }
  } catch {
    /* fall through → uncertain */
  }
  socialLog('error', 'youtube', 'short_upload', { corr: input.newsId, account: target.accountId, result: 'uncertain', status: put?.status ?? 0 })
  // Matches the ledger's transport/server patterns on purpose → "uncertain".
  return { success: false, error: put ? `YouTube yükleme yanıtı belirsiz (HTTP ${put.status})` : 'YouTube yükleme yanıtı alınamadı (network)' }
}
