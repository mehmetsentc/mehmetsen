/**
 * REELS-1 — Meta adapters for the rendered NaHaber news reel (explicit targets only;
 * the legacy Onyeditivi credentials never publish reels).
 *
 *   Instagram: POST /{ig-user-id}/media media_type=REELS video_url caption
 *              → poll status_code until FINISHED → POST /{ig-user-id}/media_publish
 *   Facebook:  POST /{page-id}/video_reels upload_phase=start → rupload file_url
 *              → POST /{page-id}/video_reels upload_phase=finish video_state=PUBLISHED
 */
import type { SocialPublishResult } from './types'
import type { FacebookPublishTarget, InstagramPublishTarget } from './accounts/targetTypes'
import { INVALID_TARGET_ERROR, isUsableFacebookTarget, isUsableInstagramTarget } from './accounts/targetGuards'
import { META_GRAPH_API_VERSION } from './graphConfig'
import { platformError, safeErrorText, socialLog } from './safeLog'

export type ReelPublishInput = { newsId: string; videoUrl: string; caption: string }

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
    const c = await form(`${base}/${target.igUserId}/media`, {
      media_type: kind,
      video_url: input.videoUrl,
      ...(kind === 'REELS' ? { caption: input.caption.slice(0, 2200), share_to_feed: 'true' } : {}),
      access_token: token,
    })
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
      description: input.caption.slice(0, 2200),
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
