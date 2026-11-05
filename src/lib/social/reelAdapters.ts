/**
 * REELS-1 — Meta adapters for the rendered NaHaber news reel (explicit targets only;
 * the legacy Onyeditivi credentials never publish reels).
 *
 *   Instagram: POST /{ig-user-id}/media media_type=REELS video_url caption
 *              → poll status_code until FINISHED → POST /{ig-user-id}/media_publish
 *   Facebook:  POST /{page-id}/video_reels upload_phase=start → rupload file_url
 *              → POST /{page-id}/video_reels upload_phase=finish video_state=PUBLISHED
 *   Threads:   POST /{threads-user-id}/threads media_type=VIDEO → poll → threads_publish
 */
import { neutralizeSocialText } from './sensitiveNews'
import type { SocialPublishResult } from './types'
import type { FacebookPublishTarget, InstagramPublishTarget, ThreadsPublishTarget } from './accounts/targetTypes'
import { INVALID_TARGET_ERROR, isUsableFacebookTarget, isUsableInstagramTarget, isUsableThreadsTarget } from './accounts/targetGuards'
import { parseMetaJson } from './accounts/connect/metaHttp'
import { META_GRAPH_API_VERSION } from './graphConfig'
import { platformError, safeErrorText, socialLog } from './safeLog'

/** coverUrl (REELS-5): NaHaber cover JPEG for the Instagram grid / Reels tab. */
export type ReelPublishInput = {
  newsId: string
  videoUrl: string
  caption: string
  coverUrl?: string | null
  /** SOCIAL-SEO-1: Facebook place id → Instagram reel location tag. */
  locationId?: string | null
}

const IG_POLL_MS = 4000
const IG_POLL_MAX = 30 // ~2 minutes of video processing
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function form(url: string, params: Record<string, string>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, json }
}

export async function publishInstagramReel(input: ReelPublishInput, target: InstagramPublishTarget): Promise<SocialPublishResult> {
  return publishInstagramVideo(input, target, 'REELS')
}

/** REELS-3: the reel MP4 as an Instagram story (no caption on stories). */
export async function publishInstagramVideoStory(input: ReelPublishInput, target: InstagramPublishTarget): Promise<SocialPublishResult> {
  return publishInstagramVideo(input, target, 'STORIES')
}

async function publishInstagramVideo(input: ReelPublishInput, target: InstagramPublishTarget, kind: 'REELS' | 'STORIES'): Promise<SocialPublishResult> {
  if (!isUsableInstagramTarget(target)) return { success: false, error: INVALID_TARGET_ERROR }
  if (!input.videoUrl.startsWith('https://')) return { success: false, error: 'Video için herkese açık https video URL gerekli' }
  const base = target.apiBase
  const token = target.accessToken
  try {
    const fields = {
      media_type: kind,
      video_url: input.videoUrl,
      ...(kind === 'REELS' ? { caption: neutralizeSocialText(input.caption).slice(0, 2200), share_to_feed: 'true' } : {}),
      ...(kind === 'REELS' && input.coverUrl?.startsWith('https://') ? { cover_url: input.coverUrl } : {}),
      access_token: token,
    }
    const withPlace = kind === 'REELS' && input.locationId ? { ...fields, location_id: input.locationId } : null
    let c = await form(`${base}/${target.igUserId}/media`, withPlace ?? fields)
    if (withPlace && (c.status >= 400 || c.json.error)) {
      // a rejected location must never cost the reel: retry once without it
      socialLog('warn', 'instagram', 'location_tag', { corr: input.newsId, result: 'rejected_retry_without' })
      c = await form(`${base}/${target.igUserId}/media`, fields)
    }
    const containerId = typeof c.json.id === 'string' ? c.json.id : ''
    if (c.status >= 400 || c.json.error || !containerId) throw platformError('instagram', 'reels kapsayıcısı', c.status, c.json)
    socialLog('log', 'instagram', 'reel_container', { corr: input.newsId, account: target.accountId, result: 'created' })

    for (let i = 0; ; i++) {
      if (i >= IG_POLL_MAX) throw new Error('Instagram reels videosu işlenmedi (zaman aşımı); yayınlama adımına geçilmedi')
      await sleep(IG_POLL_MS)
      const res = await fetch(`${base}/${containerId}?fields=status_code&access_token=${encodeURIComponent(token)}`)
      const json = (await res.json().catch(() => ({}))) as { status_code?: string; error?: unknown }
      if (json.error) throw platformError('instagram', 'reels durumu', res.status, json)
      const st = (json.status_code ?? '').toUpperCase()
      if (st === 'FINISHED') break
      if (st === 'ERROR' || st === 'EXPIRED') throw new Error(`Instagram reels videosu işlenemedi (durum ${st})`)
    }

    const p = await form(`${base}/${target.igUserId}/media_publish`, { creation_id: containerId, access_token: token })
    const mediaId = typeof p.json.id === 'string' ? p.json.id : ''
    if (p.status >= 400 || p.json.error || !mediaId) throw platformError('instagram', 'reels yayınlama', p.status, p.json)
    socialLog('log', 'instagram', 'reel', { corr: input.newsId, account: target.accountId, result: 'published', mediaId })
    return { success: true, platformId: mediaId }
  } catch (err) {
    socialLog('error', 'instagram', 'reel', { corr: input.newsId, account: target.accountId, result: 'failed', error: safeErrorText(err).slice(0, 160) })
    return { success: false, error: safeErrorText(err) }
  }
}

export async function publishFacebookReel(input: ReelPublishInput, target: FacebookPublishTarget): Promise<SocialPublishResult> {
  if (!isUsableFacebookTarget(target)) return { success: false, error: INVALID_TARGET_ERROR }
  if (!input.videoUrl.startsWith('https://')) return { success: false, error: 'Reels için herkese açık https video URL gerekli' }
  const base = target.apiBase
  const token = target.accessToken
  try {
    const s = await form(`${base}/${target.pageId}/video_reels`, { upload_phase: 'start', access_token: token })
    const videoId = typeof s.json.video_id === 'string' ? s.json.video_id : ''
    if (s.status >= 400 || s.json.error || !videoId) throw platformError('facebook', 'reels başlatma', s.status, s.json)

    const up = await fetch(`https://rupload.facebook.com/video-upload/${META_GRAPH_API_VERSION}/${videoId}`, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, file_url: input.videoUrl },
    })
    const upJson = (await up.json().catch(() => ({}))) as Record<string, unknown>
    if (up.status >= 400 || upJson.error || upJson.success === false) throw platformError('facebook', 'reels yükleme', up.status, upJson)

    const f = await form(`${base}/${target.pageId}/video_reels`, {
      upload_phase: 'finish',
      video_id: videoId,
      video_state: 'PUBLISHED',
      description: neutralizeSocialText(input.caption).slice(0, 2200),
      access_token: token,
    })
    if (f.status >= 400 || f.json.error || f.json.success === false) throw platformError('facebook', 'reels yayınlama', f.status, f.json)
    socialLog('log', 'facebook', 'reel', { corr: input.newsId, account: target.accountId, result: 'published', videoId })
    return { success: true, platformId: videoId }
  } catch (err) {
    socialLog('error', 'facebook', 'reel', { corr: input.newsId, account: target.accountId, result: 'failed', error: safeErrorText(err).slice(0, 160) })
    return { success: false, error: safeErrorText(err) }
  }
}

/**
 * REELS-3: the reel MP4 as a Facebook Page story.
 * POST /{page-id}/video_stories upload_phase=start → rupload file_url → upload_phase=finish.
 */
export async function publishFacebookVideoStory(input: ReelPublishInput, target: FacebookPublishTarget): Promise<SocialPublishResult> {
  if (!isUsableFacebookTarget(target)) return { success: false, error: INVALID_TARGET_ERROR }
  if (!input.videoUrl.startsWith('https://')) return { success: false, error: 'Video için herkese açık https video URL gerekli' }
  const base = target.apiBase
  const token = target.accessToken
  try {
    const s = await form(`${base}/${target.pageId}/video_stories`, { upload_phase: 'start', access_token: token })
    const videoId = typeof s.json.video_id === 'string' ? s.json.video_id : ''
    if (s.status >= 400 || s.json.error || !videoId) throw platformError('facebook', 'video hikâye başlatma', s.status, s.json)
    const up = await fetch(`https://rupload.facebook.com/video-upload/${META_GRAPH_API_VERSION}/${videoId}`, {
      method: 'POST',
      headers: { Authorization: `OAuth ${token}`, file_url: input.videoUrl },
    })
    const upJson = (await up.json().catch(() => ({}))) as Record<string, unknown>
    if (up.status >= 400 || upJson.error || upJson.success === false) throw platformError('facebook', 'video hikâye yükleme', up.status, upJson)
    const f = await form(`${base}/${target.pageId}/video_stories`, { upload_phase: 'finish', video_id: videoId, access_token: token })
    if (f.status >= 400 || f.json.error || f.json.success === false) throw platformError('facebook', 'video hikâye yayınlama', f.status, f.json)
    const postId = typeof f.json.post_id === 'string' ? f.json.post_id : videoId
    socialLog('log', 'facebook', 'video_story', { corr: input.newsId, account: target.accountId, result: 'published', postId })
    return { success: true, platformId: postId }
  } catch (err) {
    socialLog('error', 'facebook', 'video_story', { corr: input.newsId, account: target.accountId, result: 'failed', error: safeErrorText(err).slice(0, 160) })
    return { success: false, error: safeErrorText(err) }
  }
}

// ── Threads video (THREADS-VIDEO-1) ──────────────────────────────────────────
//   POST /{threads-user-id}/threads media_type=VIDEO video_url text
//   → poll GET /{container}?fields=status,error_message until FINISHED
//   → POST /{threads-user-id}/threads_publish creation_id
// Docs: video ≤ 5 min, ≤ 1 GB, MP4/MOV, 23–60 fps; text ≤ 500 characters.
// The container must be FINISHED before publishing; a timeout BEFORE publish is a
// definite failure (nothing was posted), never «uncertain».

const TH_POLL_MS = 5000
const TH_POLL_MAX = 60 // ~5 minutes of video processing
export const THREADS_VIDEO_TEXT_LIMIT = 500

/** Threads text: the caption cut on a word boundary to 500 characters (link and hashtags kept when they fit). */
export function threadsVideoText(caption: string): string {
  const t = neutralizeSocialText(caption).replace(/\n{3,}/g, '\n\n').trim()
  if (t.length <= THREADS_VIDEO_TEXT_LIMIT) return t
  const cut = t.slice(0, THREADS_VIDEO_TEXT_LIMIT - 1)
  const at = cut.lastIndexOf(' ')
  return `${(at > 300 ? cut.slice(0, at) : cut).trim()}…`
}

export async function publishThreadsVideo(input: ReelPublishInput, target: ThreadsPublishTarget): Promise<SocialPublishResult> {
  if (!isUsableThreadsTarget(target)) return { success: false, error: INVALID_TARGET_ERROR }
  if (!input.videoUrl.startsWith('https://')) return { success: false, error: 'Video için herkese açık https video URL gerekli' }
  const base = target.apiBase
  const token = target.accessToken
  try {
    const c = await formExact(`${base}/${target.threadsUserId}/threads`, {
      media_type: 'VIDEO',
      video_url: input.videoUrl,
      text: threadsVideoText(input.caption),
      access_token: token,
    })
    const containerId = typeof c.json.id === 'string' ? c.json.id : ''
    if (c.status >= 400 || c.json.error || !containerId) throw platformError('threads', 'video kapsayıcısı', c.status, c.json)
    socialLog('log', 'threads', 'video_container', { corr: input.newsId, account: target.accountId, result: 'created' })

    for (let i = 0; ; i++) {
      if (i >= TH_POLL_MAX) throw new Error('Threads videosu işlenmedi (zaman aşımı); yayınlama adımına geçilmedi')
      await sleep(TH_POLL_MS)
      const res = await fetch(`${base}/${containerId}?fields=status,error_message&access_token=${encodeURIComponent(token)}`)
      const json = (await res.json().catch(() => ({}))) as { status?: string; error?: unknown }
      if (json.error) throw platformError('threads', 'video durumu', res.status, json)
      const st = (json.status ?? '').toUpperCase()
      if (st === 'FINISHED') break
      // error_message is platform text — not propagated.
      if (st === 'ERROR' || st === 'EXPIRED') throw new Error(`Threads videosu işlenemedi (durum ${st})`)
    }

    const p = await formExact(`${base}/${target.threadsUserId}/threads_publish`, { creation_id: containerId, access_token: token })
    const mediaId = typeof p.json.id === 'string' ? p.json.id : ''
    if (p.status >= 400 || p.json.error || !mediaId) throw platformError('threads', 'video yayınlama', p.status, p.json)
    socialLog('log', 'threads', 'video', { corr: input.newsId, account: target.accountId, result: 'published', mediaId })
    return { success: true, platformId: mediaId }
  } catch (err) {
    socialLog('error', 'threads', 'video', { corr: input.newsId, account: target.accountId, result: 'failed', error: safeErrorText(err).slice(0, 160) })
    return { success: false, error: safeErrorText(err) }
  }
}

/** Form POST whose JSON keeps large numeric ids exact (Threads returns ids as numbers). */
async function formExact(url: string, params: Record<string, string>): Promise<{ status: number; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
  })
  let json: Record<string, unknown> = {}
  try {
    json = parseMetaJson(await res.text()) as Record<string, unknown>
  } catch {
    json = {}
  }
  if (typeof json.id === 'number') json.id = String(json.id)
  return { status: res.status, json }
}
