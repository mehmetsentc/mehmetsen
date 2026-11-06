/**
 * TIKTOK-1 — publish NaHaber's rendered vertical MP4 to ONE TikTok account
 * (Content Posting API, Direct Post or inbox draft).
 *
 * TikTok Content Sharing Guidelines are enforced by the caller's dialog AND
 * re-checked here:
 *   - creator info is queried at publish time; a creator who can't post now
 *     (spam_risk_* / reached_active_user_cap) stops the publish
 *   - privacy_level must be one of the creator's `privacy_level_options` and is
 *     always the editor's explicit choice (no default)
 *   - comment / duet / stitch can't be enabled where the creator disabled them
 *   - branded content can't be «only me»
 *   - video length ≤ max_video_post_duration_sec
 *
 * Flow (FILE_UPLOAD — the MP4 lives on Google Storage, not on a TikTok-verified
 * domain, so PULL_FROM_URL is not used):
 *   1. download from NaHaber Storage (allow-listed hosts only)
 *   2. POST /post/publish/video/init/ (or /inbox/video/init/) → publish_id + upload_url
 *   3. PUT the bytes (single chunk ≤ 64 MB, else 10 MB chunks, last chunk merged)
 *   4. poll /post/publish/status/fetch/ for up to ~60 s
 *
 * Ledger: the publish_id is the platform reference (TikTok's public post id
 * exists only after moderation, often minutes later). Anything that fails
 * before the upload is FAILED; a lost answer during/after upload is UNCERTAIN
 * (messages match the ledger's transport pattern) and is never re-sent blindly.
 *
 * Tokens, upload URLs and TikTok messages are never logged.
 */
import type { SocialPublishResult } from './types'
import type { TikTokPublishTarget } from './accounts/targetTypes'
import { INVALID_TARGET_ERROR } from './accounts/targetGuards'
import { isAllowedVideoUrl } from './youtubeShorts'
import { TIKTOK_API_BASE } from './graphConfig'
import { queryTikTokCreatorInfo, tiktokRequest, isTikTokPrivacyLevel, TIKTOK_OPEN_ID_RE, type TikTokCreatorInfo, type TikTokPrivacyLevel } from './accounts/connect/tiktokOAuth'
import { neutralizeSocialText } from './sensitiveNews'
import { socialLog } from './safeLog'

export type TikTokPostMode = 'direct' | 'inbox'

/** The editor's explicit choices from the post dialog. Nothing here has a default. */
export interface TikTokPostSettings {
  mode: TikTokPostMode
  /** Direct Post only. */
  privacyLevel: TikTokPrivacyLevel | null
  allowComment: boolean
  allowDuet: boolean
  allowStitch: boolean
  /** Commercial content disclosure. */
  commercial: boolean
  /** «Your brand» → Promotional content. */
  yourBrand: boolean
  /** «Branded content» → Paid partnership. */
  brandedContent: boolean
  /** Video made with AI (NaHaber's presenter / voice). */
  aiGenerated: boolean
  /** Editable title / caption (≤ 2200). */
  title: string
  /** Editor ticked the Music Usage (and Branded Content) confirmation. */
  consent: boolean
}

export interface TikTokPublishInput {
  newsId: string
  videoUrl: string
  /** Video length in seconds when known (checked against creator max). */
  seconds: number | null
  settings: TikTokPostSettings
}

export const TIKTOK_TITLE_MAX = 2200
export const MAX_TIKTOK_BYTES = 4 * 1024 * 1024 * 1024
const SINGLE_CHUNK_MAX = 64 * 1024 * 1024
const CHUNK = 10 * 1024 * 1024

type FetchFn = typeof fetch

/** Human (Turkish) text for TikTok's error codes. */
export const TIKTOK_ERROR_TEXT: Record<string, string> = {
  spam_risk_too_many_posts: 'Bu TikTok hesabı bugünkü paylaşım sınırına ulaştı; daha sonra tekrar deneyin',
  spam_risk_user_banned_from_posting: 'TikTok bu hesabın paylaşım yapmasını engellemiş',
  reached_active_user_cap: 'NaHaber uygulamasının TikTok günlük kullanıcı sınırı doldu; daha sonra tekrar deneyin',
  unaudited_client_can_only_post_to_private_accounts: 'TikTok incelemesi tamamlanana kadar yalnızca gizli (private) hesaplara paylaşılabilir',
  privacy_level_option_mismatch: 'Seçilen gizlilik ayarı bu hesap için geçerli değil',
  scope_not_authorized: 'TikTok paylaşım izni eksik — hesabı yeniden bağlayın',
  access_token_invalid: 'TikTok bağlantısı geçersiz — hesabı yeniden bağlayın',
  url_ownership_unverified: 'Video adresi TikTok’ta doğrulanmamış',
  rate_limit_exceeded: 'TikTok istek sınırı aşıldı; bir dakika sonra tekrar deneyin',
  invalid_param: 'TikTok paylaşım bilgilerini kabul etmedi',
}

export const TIKTOK_FAIL_REASON_TEXT: Record<string, string> = {
  file_format_check_failed: 'TikTok video biçimini kabul etmedi',
  duration_check_failed: 'Video süresi TikTok sınırına uymuyor',
  frame_rate_check_failed: 'Video kare hızı TikTok sınırına uymuyor',
  picture_size_check_failed: 'Video çözünürlüğü TikTok sınırına uymuyor',
  publish_cancelled: 'Paylaşım iptal edildi',
  auth_removed: 'Hesap NaHaber’in erişimini kaldırmış — yeniden bağlayın',
  spam_risk_too_many_posts: 'Bu TikTok hesabı bugünkü paylaşım sınırına ulaştı',
  spam_risk_user_banned_from_posting: 'TikTok bu hesabın paylaşım yapmasını engellemiş',
  spam_risk_text: 'TikTok başlık metnini riskli buldu',
  spam_risk: 'TikTok paylaşımı risk nedeniyle durdurdu',
  internal: 'TikTok tarafında geçici hata',
  video_pull_failed: 'TikTok videoyu alamadı',
}

export function tiktokText(code: string | null | undefined, fallback: string): string {
  return (code && TIKTOK_ERROR_TEXT[code]) || fallback
}

/** TikTok caption: neutral text, ≤ 2200 characters. */
export function tiktokTitle(raw: string): string {
  const t = neutralizeSocialText(raw).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim()
  return t.length > TIKTOK_TITLE_MAX ? `${t.slice(0, TIKTOK_TITLE_MAX - 1).trim()}…` : t
}

/** Validate the editor's choices against the CURRENT creator info. Returns a Turkish reason or null. */
export function settingsProblem(s: TikTokPostSettings, info: TikTokCreatorInfo, seconds: number | null): string | null {
  if (!s.consent) return 'TikTok müzik kullanım onayı işaretlenmedi'
  if (s.mode === 'direct') {
    if (!s.privacyLevel || !isTikTokPrivacyLevel(s.privacyLevel)) return 'Gizlilik ayarı seçilmedi'
    if (!info.privacyLevelOptions.includes(s.privacyLevel)) return 'Seçilen gizlilik ayarı bu hesap için geçerli değil'
    if (s.commercial && s.brandedContent && s.privacyLevel === 'SELF_ONLY') return 'Markalı içerik «Yalnızca ben» olarak paylaşılamaz'
  }
  if (s.allowComment && info.commentDisabled) return 'Bu hesapta yorumlar kapalı'
  if (s.allowDuet && info.duetDisabled) return 'Bu hesapta Duet kapalı'
  if (s.allowStitch && info.stitchDisabled) return 'Bu hesapta Stitch kapalı'
  if (s.commercial && !s.yourBrand && !s.brandedContent) return 'Ticari içerik açıkken «Kendi markanız» veya «Markalı içerik» seçilmeli'
  if (seconds !== null && info.maxVideoPostDurationSec !== null && seconds > info.maxVideoPostDurationSec) {
    return `Video ${Math.round(seconds)} sn; bu hesap en fazla ${info.maxVideoPostDurationSec} sn video kabul ediyor`
  }
  if (!tiktokTitle(s.title)) return 'Başlık boş olamaz'
  return null
}

/** Chunk plan per TikTok media transfer rules (≤ 64 MB single; else 10 MB chunks, remainder merged into the last). */
export function chunkPlan(size: number): { chunkSize: number; count: number } {
  if (size <= SINGLE_CHUNK_MAX) return { chunkSize: size, count: 1 }
  return { chunkSize: CHUNK, count: Math.floor(size / CHUNK) }
}

async function downloadVideo(url: string, fetchFn: FetchFn): Promise<Buffer> {
  const res = await fetchFn(url, { signal: AbortSignal.timeout(60_000) })
  if (!res.ok) throw new Error(`Video depodan okunamadı (durum ${res.status})`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length === 0) throw new Error('Video boş')
  if (buf.length > MAX_TIKTOK_BYTES) throw new Error('Video TikTok için çok büyük')
  return buf
}

function isUsableTikTokTarget(t: TikTokPublishTarget | null | undefined): t is TikTokPublishTarget {
  return !!t && t.platform === 'tiktok' && TIKTOK_OPEN_ID_RE.test(t.openId) && t.apiBase === TIKTOK_API_BASE && typeof t.accessToken === 'string' && t.accessToken.length > 0
}

export type TikTokStatus = 'PROCESSING_UPLOAD' | 'PROCESSING_DOWNLOAD' | 'SEND_TO_USER_INBOX' | 'PUBLISH_COMPLETE' | 'FAILED'

export interface TikTokStatusResult {
  status: TikTokStatus | null
  failReason: string | null
  postIds: string[]
}

export async function fetchTikTokPostStatus(accessToken: string, publishId: string, fetchFn?: FetchFn): Promise<TikTokStatusResult | { error: string }> {
  const r = await tiktokRequest<{ status?: string; fail_reason?: string; publicaly_available_post_id?: unknown[] }>(
    'tiktok.status',
    `${TIKTOK_API_BASE}/post/publish/status/fetch/`,
    { json: { publish_id: publishId }, bearer: accessToken, fetch: fetchFn },
  )
  if (!r.ok) return { error: r.error.code ?? `http_${r.error.status}` }
  const st = r.data?.status
  const known: TikTokStatus[] = ['PROCESSING_UPLOAD', 'PROCESSING_DOWNLOAD', 'SEND_TO_USER_INBOX', 'PUBLISH_COMPLETE', 'FAILED']
  return {
    status: known.includes(st as TikTokStatus) ? (st as TikTokStatus) : null,
    failReason: typeof r.data?.fail_reason === 'string' && /^[a-z_]{1,64}$/.test(r.data.fail_reason) ? r.data.fail_reason : null,
    postIds: (Array.isArray(r.data?.publicaly_available_post_id) ? r.data!.publicaly_available_post_id : []).map((x) => String(x)).filter((x) => /^[0-9]{5,25}$/.test(x)),
  }
}

export interface TikTokPublishOutcome extends SocialPublishResult {
  /** Last status seen while polling (null when not polled). */
  tiktokStatus?: TikTokStatus | null
}

export async function publishTikTokVideo(
  input: TikTokPublishInput,
  target: TikTokPublishTarget,
  deps: { fetch?: FetchFn; pollMs?: number; pollTimes?: number; creatorInfo?: TikTokCreatorInfo } = {},
): Promise<TikTokPublishOutcome> {
  const fetchFn = deps.fetch ?? fetch
  if (!isUsableTikTokTarget(target)) return { success: false, error: INVALID_TARGET_ERROR }
  if (!isAllowedVideoUrl(input.videoUrl)) return { success: false, error: 'TikTok için NaHaber deposunda bir video gerekli' }
  const token = target.accessToken
  const log = { corr: input.newsId, account: target.accountId }

  // ── 0. Creator info at publish time (can the creator post right now?) ────
  let info = deps.creatorInfo
  if (!info) {
    const ci = await queryTikTokCreatorInfo(token, fetchFn)
    if (!ci.ok) {
      socialLog('warn', 'tiktok', 'creator_info', { ...log, code: ci.code })
      return { success: false, error: tiktokText(ci.code, `TikTok hesap bilgisi alınamadı (${ci.code})`).replace(/network/gi, 'bağlantı sorunu') }
    }
    info = ci.info
  }
  const problem = settingsProblem(input.settings, info, input.seconds)
  if (problem) return { success: false, error: problem }

  // ── 1. MP4 (nothing reaches TikTok on failure) ─────────────────────────────
  let bytes: Buffer
  try {
    bytes = await downloadVideo(input.videoUrl, fetchFn)
  } catch (err) {
    socialLog('error', 'tiktok', 'download', { ...log, result: 'failed' })
    return { success: false, error: String((err as Error)?.message ?? 'Video okunamadı').replace(/fetch failed|network|timeout|timed out|aborted/gi, 'bağlantı sorunu') }
  }
  const plan = chunkPlan(bytes.length)

  // ── 2. Init ───────────────────────────────────────────────────────────────
  const s = input.settings
  const source_info = { source: 'FILE_UPLOAD', video_size: bytes.length, chunk_size: plan.chunkSize, total_chunk_count: plan.count }
  const body =
    s.mode === 'direct'
      ? {
          post_info: {
            title: tiktokTitle(s.title),
            privacy_level: s.privacyLevel,
            disable_comment: !s.allowComment,
            disable_duet: !s.allowDuet,
            disable_stitch: !s.allowStitch,
            brand_content_toggle: s.commercial && s.brandedContent,
            brand_organic_toggle: s.commercial && s.yourBrand,
            is_aigc: s.aiGenerated,
          },
          source_info,
        }
      : { source_info }
  const initUrl = s.mode === 'direct' ? `${TIKTOK_API_BASE}/post/publish/video/init/` : `${TIKTOK_API_BASE}/post/publish/inbox/video/init/`
  const init = await tiktokRequest<{ publish_id?: string; upload_url?: string }>('tiktok.init', initUrl, { json: body, bearer: token, fetch: fetchFn, timeoutMs: 30_000 })
  if (!init.ok) {
    socialLog('error', 'tiktok', 'init', { ...log, status: init.error.status, code: init.error.code ?? '-' })
    // Init never created a post → definite failure (text avoids the ledger's transport pattern).
    return { success: false, error: tiktokText(init.error.code, `TikTok paylaşımı başlatılamadı (durum ${init.error.status}${init.error.code && init.error.code !== 'network' ? `, ${init.error.code}` : ''})`) }
  }
  const publishId = init.data?.publish_id?.trim() || ''
  const uploadUrl = init.data?.upload_url?.trim() || ''
  if (!/^[0-9A-Za-z_.~-]{4,64}$/.test(publishId) || !uploadUrl.startsWith('https://')) {
    return { success: false, error: 'TikTok yükleme adresi alınamadı; video gönderilmedi' }
  }

  // ── 3. Upload (from here a lost answer is "uncertain") ─────────────────────
  for (let i = 0; i < plan.count; i++) {
    const start = i * plan.chunkSize
    const end = i === plan.count - 1 ? bytes.length - 1 : start + plan.chunkSize - 1
    let put: Response | null = null
    try {
      put = await fetchFn(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${bytes.length}` },
        body: new Uint8Array(bytes.subarray(start, end + 1)),
        signal: AbortSignal.timeout(240_000),
      })
    } catch {
      put = null
    }
    if (!put || put.status >= 500) {
      socialLog('error', 'tiktok', 'upload', { ...log, result: 'uncertain', chunk: i, status: put?.status ?? 0 })
      return { success: false, error: put ? `TikTok yükleme yanıtı belirsiz (HTTP ${put.status})` : 'TikTok yükleme yanıtı alınamadı (network)' }
    }
    if (put.status >= 400) {
      socialLog('error', 'tiktok', 'upload', { ...log, result: 'rejected', chunk: i, status: put.status })
      return { success: false, error: `TikTok videoyu reddetti (durum ${put.status})` }
    }
  }

  // ── 4. Short status poll ───────────────────────────────────────────────────
  const times = deps.pollTimes ?? 12
  const wait = deps.pollMs ?? 5000
  let last: TikTokStatus | null = null
  for (let i = 0; i < times; i++) {
    if (wait > 0) await new Promise((r) => setTimeout(r, wait))
    const st = await fetchTikTokPostStatus(token, publishId, fetchFn)
    if ('error' in st) continue
    last = st.status
    if (st.status === 'FAILED') {
      socialLog('warn', 'tiktok', 'status', { ...log, result: 'failed', reason: st.failReason ?? '-' })
      return { success: false, error: (st.failReason && TIKTOK_FAIL_REASON_TEXT[st.failReason]) || 'TikTok videoyu işleyemedi', tiktokStatus: 'FAILED' }
    }
    if (st.status === 'PUBLISH_COMPLETE' || st.status === 'SEND_TO_USER_INBOX') break
  }
  socialLog('log', 'tiktok', 'video', { ...log, result: last ?? 'processing', mode: s.mode })
  // publish_id is TikTok's reference for this post (status can be checked later).
  return { success: true, platformId: publishId, tiktokStatus: last }
}
