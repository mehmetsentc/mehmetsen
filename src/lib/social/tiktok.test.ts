/** TIKTOK-1 — TikTok connection helpers and the Direct Post publisher (no network). */
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

import { buildTikTokAuthorizeUrl, parseTikTokScopes, tiktokErrorCode, exchangeTikTokCode, refreshTikTokToken, TikTokRefreshRejectedError, type TikTokCreatorInfo } from './accounts/connect/tiktokOAuth'
import { chunkPlan, publishTikTokVideo, settingsProblem, tiktokTitle, type TikTokPostSettings } from './tiktokPublish'
import { parseSocialAccount, publishPermissionState, accountIdFor } from './accounts/types'
import { apiBaseFor } from './accounts/apiHosts'
import { publishableKinds } from './accounts/capabilities'
import { TIKTOK_API_BASE } from './graphConfig'
import type { TikTokPublishTarget } from './accounts/targetTypes'

const cfg = { platform: 'tiktok' as const, appId: 'sbawtestkey123', appSecret: 'secret-xyz', redirectUri: 'https://www.nahaber.com/api/admin/social/oauth/tiktok/callback' }

const info: TikTokCreatorInfo = {
  nickname: 'NaHaber Antalya',
  username: 'nahaberantalya',
  avatarUrl: null,
  privacyLevelOptions: ['FOLLOWER_OF_CREATOR', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
  commentDisabled: false,
  duetDisabled: true,
  stitchDisabled: false,
  maxVideoPostDurationSec: 600,
}

const settings = (o: Partial<TikTokPostSettings> = {}): TikTokPostSettings => ({
  mode: 'direct',
  privacyLevel: 'SELF_ONLY',
  allowComment: false,
  allowDuet: false,
  allowStitch: false,
  commercial: false,
  yourBrand: false,
  brandedContent: false,
  aiGenerated: true,
  title: 'Antalya’da sağanak',
  consent: true,
  ...o,
})

function target(): TikTokPublishTarget {
  const t = { accountId: 'tiktok_abcdef123', connectionMethod: 'tiktok_oauth' as const, apiBase: TIKTOK_API_BASE, platform: 'tiktok' as const, openId: 'abcdef123' }
  Object.defineProperty(t, 'accessToken', { value: 'act.TOKEN', enumerable: false })
  return t as TikTokPublishTarget
}

const okJson = (data: unknown, status = 200) => new Response(JSON.stringify({ data, error: { code: 'ok', message: '', log_id: 'x' } }), { status, headers: { 'content-type': 'application/json' } })

describe('TikTok OAuth helpers', () => {
  it('authorize URL: client_key, comma scopes, state, exact redirect', () => {
    const u = new URL(buildTikTokAuthorizeUrl(cfg, 'STATE1'))
    expect(u.origin + u.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/')
    expect(u.searchParams.get('client_key')).toBe('sbawtestkey123')
    expect(u.searchParams.get('scope')).toBe('user.info.basic,video.publish,video.upload')
    expect(u.searchParams.get('redirect_uri')).toBe(cfg.redirectUri)
    expect(u.searchParams.get('state')).toBe('STATE1')
    expect(u.toString()).not.toContain('secret')
  })

  it('scopes are parsed from the comma-separated token response', () => {
    expect(parseTikTokScopes('user.info.basic, video.publish,video.publish')).toEqual(['user.info.basic', 'video.publish'])
    expect(parseTikTokScopes('')).toBeNull()
  })

  it('error code is reduced to the short code (never the message)', () => {
    expect(tiktokErrorCode({ error: { code: 'access_token_invalid', message: 'token act.SECRET' } })).toBe('access_token_invalid')
    expect(tiktokErrorCode({ error: 'invalid_grant', error_description: 'x' })).toBe('invalid_grant')
  })

  it('code exchange keeps refresh token, open_id, expiries and granted scopes', async () => {
    const f = vi.fn(async () =>
      new Response(JSON.stringify({ access_token: 'act.A', expires_in: 86400, refresh_token: 'rft.R', refresh_expires_in: 31536000, open_id: 'abcdef123', scope: 'user.info.basic,video.publish' }), { status: 200 }),
    )
    const t = await exchangeTikTokCode(cfg, 'CODE', 1000, f as unknown as typeof fetch)
    expect(t).toMatchObject({ refreshToken: 'rft.R', openId: 'abcdef123', accessExpiresAt: 1000 + 86400_000, refreshExpiresAt: 1000 + 31536000_000, scopes: ['user.info.basic', 'video.publish'] })
    const body = String((f.mock.calls[0] as unknown as [string, RequestInit])[1].body)
    expect(body).toContain('grant_type=authorization_code')
    expect(body).toContain('client_key=sbawtestkey123')
  })

  it('rejected refresh → TikTokRefreshRejectedError (reconnect)', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'expired' }), { status: 400 }))
    await expect(refreshTikTokToken(cfg, 'rft.OLD', 0, f as unknown as typeof fetch)).rejects.toBeInstanceOf(TikTokRefreshRejectedError)
  })
})

describe('TikTok account model', () => {
  const raw = {
    platform: 'tiktok',
    connectionMethod: 'tiktok_oauth',
    externalId: 'abcdef123',
    tiktok: { openId: 'abcdef123' },
    status: 'active',
    ownership: { citySlug: 'antalya', publisherId: null },
    grantedPermissions: ['user.info.basic', 'video.publish', 'video.upload'],
    permissionsVerifiedAt: 1,
  }

  it('parses, needs user.info.basic + video.publish, uses the TikTok API host', () => {
    const a = parseSocialAccount(accountIdFor('tiktok', 'abcdef123'), raw)
    expect(a?.platform).toBe('tiktok')
    expect(publishPermissionState(a!)).toBe('verified')
    expect(publishPermissionState({ ...a!, grantedPermissions: ['user.info.basic'] })).toBe('missing')
    expect(apiBaseFor('tiktok', 'tiktok_oauth')).toBe(TIKTOK_API_BASE)
    expect(apiBaseFor('tiktok', 'legacy')).toBeNull()
  })

  it('rejects a mismatched open id or another connection method', () => {
    expect(parseSocialAccount('tiktok_abcdef123', { ...raw, tiktok: { openId: 'other' } })).toBeNull()
    expect(parseSocialAccount('tiktok_abcdef123', { ...raw, connectionMethod: 'legacy' })).toBeNull()
  })

  it('is never an automation / generic reel target (dialog only)', () => {
    expect(publishableKinds({ platform: 'tiktok', connectionMethod: 'tiktok_oauth', platformAccountType: null })).toEqual([])
  })
})

describe('settingsProblem (TikTok Content Sharing Guidelines)', () => {
  it('accepts valid explicit choices', () => {
    expect(settingsProblem(settings(), info, 45)).toBeNull()
  })
  it('requires consent and an explicit privacy from the creator options', () => {
    expect(settingsProblem(settings({ consent: false }), info, 45)).toMatch(/onay/)
    expect(settingsProblem(settings({ privacyLevel: null }), info, 45)).toMatch(/seçilmedi/)
    expect(settingsProblem(settings({ privacyLevel: 'PUBLIC_TO_EVERYONE' }), info, 45)).toMatch(/geçerli değil/)
  })
  it('respects disabled interactions, commercial disclosure and branded privacy', () => {
    expect(settingsProblem(settings({ allowDuet: true }), info, 45)).toMatch(/Duet/)
    expect(settingsProblem(settings({ commercial: true }), info, 45)).toMatch(/markanız/)
    expect(settingsProblem(settings({ commercial: true, brandedContent: true }), info, 45)).toMatch(/Yalnızca ben/)
    expect(settingsProblem(settings({ commercial: true, yourBrand: true }), info, 45)).toBeNull()
  })
  it('checks the creator max video duration', () => {
    expect(settingsProblem(settings(), { ...info, maxVideoPostDurationSec: 30 }, 45)).toMatch(/en fazla 30 sn/)
  })
  it('inbox mode does not need a privacy level', () => {
    expect(settingsProblem(settings({ mode: 'inbox', privacyLevel: null }), info, 45)).toBeNull()
  })
})

describe('chunk plan and title', () => {
  it('single chunk up to 64 MB, else 10 MB chunks with the remainder in the last', () => {
    expect(chunkPlan(20 * 1024 * 1024)).toEqual({ chunkSize: 20 * 1024 * 1024, count: 1 })
    expect(chunkPlan(95 * 1024 * 1024)).toEqual({ chunkSize: 10 * 1024 * 1024, count: 9 })
  })
  it('title ≤ 2200', () => {
    expect(tiktokTitle('a'.repeat(3000)).length).toBe(2200)
  })
})

describe('publishTikTokVideo', () => {
  const VIDEO = 'https://storage.googleapis.com/nahaber/reels/n1.mp4'

  function fakeFetch(statuses: string[] = ['PUBLISH_COMPLETE'], opts: { put?: number; init?: Response } = {}) {
    const calls: Array<{ url: string; init: RequestInit }> = []
    let s = 0
    const f = vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, init })
      if (url === VIDEO) return new Response(new Uint8Array(1000), { status: 200 })
      if (url.endsWith('/creator_info/query/')) return okJson({ creator_nickname: 'NaHaber Antalya', privacy_level_options: info.privacyLevelOptions, max_video_post_duration_sec: 600 })
      if (url.endsWith('/video/init/')) return opts.init ?? okJson({ publish_id: 'v_pub_123', upload_url: 'https://open-upload.tiktokapis.com/upload?upload_id=1' })
      if (url.startsWith('https://open-upload.tiktokapis.com/')) return new Response(null, { status: opts.put ?? 201 })
      if (url.endsWith('/status/fetch/')) return okJson({ status: statuses[Math.min(s++, statuses.length - 1)] })
      return new Response('{}', { status: 404 })
    })
    return { f: f as unknown as typeof fetch, calls }
  }

  it('direct post: creator info → init (FILE_UPLOAD, editor settings) → PUT → status', async () => {
    const { f, calls } = fakeFetch(['PROCESSING_UPLOAD', 'PUBLISH_COMPLETE'])
    const r = await publishTikTokVideo({ newsId: 'n1', videoUrl: VIDEO, seconds: 40, settings: settings() }, target(), { fetch: f, pollMs: 0 })
    expect(r).toMatchObject({ success: true, platformId: 'v_pub_123', tiktokStatus: 'PUBLISH_COMPLETE' })
    const init = calls.find((c) => c.url.endsWith('/post/publish/video/init/'))!
    const body = JSON.parse(String(init.init.body))
    expect(body.post_info).toMatchObject({ privacy_level: 'SELF_ONLY', disable_comment: true, disable_duet: true, disable_stitch: true, brand_content_toggle: false, brand_organic_toggle: false, is_aigc: true })
    expect(body.source_info).toEqual({ source: 'FILE_UPLOAD', video_size: 1000, chunk_size: 1000, total_chunk_count: 1 })
    const put = calls.find((c) => c.url.startsWith('https://open-upload'))!
    expect((put.init.headers as Record<string, string>)['Content-Range']).toBe('bytes 0-999/1000')
    expect(JSON.stringify(calls.map((c) => c.init.headers))).toContain('Bearer act.TOKEN')
    expect(JSON.stringify(r)).not.toContain('act.TOKEN')
  })

  it('inbox mode uses the inbox endpoint and sends no post_info', async () => {
    const { f, calls } = fakeFetch(['SEND_TO_USER_INBOX'])
    const r = await publishTikTokVideo({ newsId: 'n1', videoUrl: VIDEO, seconds: 40, settings: settings({ mode: 'inbox', privacyLevel: null }) }, target(), { fetch: f, pollMs: 0 })
    expect(r.success).toBe(true)
    const init = calls.find((c) => c.url.endsWith('/inbox/video/init/'))!
    expect(JSON.parse(String(init.init.body)).post_info).toBeUndefined()
  })

  it('invalid settings never reach TikTok init', async () => {
    const { f, calls } = fakeFetch()
    const r = await publishTikTokVideo({ newsId: 'n1', videoUrl: VIDEO, seconds: 40, settings: settings({ consent: false }) }, target(), { fetch: f, pollMs: 0 })
    expect(r.success).toBe(false)
    expect(calls.some((c) => c.url.endsWith('/video/init/'))).toBe(false)
  })

  it('creator who cannot post now (spam_risk) → stops with a Turkish reason', async () => {
    const f = vi.fn(async (url: string) =>
      url.endsWith('/creator_info/query/')
        ? new Response(JSON.stringify({ data: {}, error: { code: 'spam_risk_too_many_posts', message: 'x' } }), { status: 200 })
        : new Response('{}', { status: 500 }),
    ) as unknown as typeof fetch
    const r = await publishTikTokVideo({ newsId: 'n1', videoUrl: VIDEO, seconds: 40, settings: settings() }, target(), { fetch: f, pollMs: 0 })
    expect(r).toMatchObject({ success: false })
    expect(r.error).toMatch(/paylaşım sınırına/)
  })

  it('init rejection is a definite failure; upload 5xx / lost answer is uncertain (network pattern)', async () => {
    const rejected = fakeFetch([], { init: new Response(JSON.stringify({ error: { code: 'unaudited_client_can_only_post_to_private_accounts' } }), { status: 403 }) })
    const a = await publishTikTokVideo({ newsId: 'n1', videoUrl: VIDEO, seconds: 40, settings: settings() }, target(), { fetch: rejected.f, pollMs: 0 })
    expect(a.error).toMatch(/gizli \(private\)/)
    expect(a.error).not.toMatch(/network|timeout/i)

    const lost = fakeFetch([], { put: 503 })
    const b = await publishTikTokVideo({ newsId: 'n1', videoUrl: VIDEO, seconds: 40, settings: settings() }, target(), { fetch: lost.f, pollMs: 0 })
    expect(b.success).toBe(false)
    expect(b.error).toMatch(/belirsiz/)
  })

  it('TikTok processing FAILED → failure with the reason text', async () => {
    const { f } = fakeFetch(['FAILED'])
    const f2 = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith('/status/fetch/') ? okJson({ status: 'FAILED', fail_reason: 'duration_check_failed' }) : (f as unknown as (u: string, i?: RequestInit) => Promise<Response>)(url, init),
    ) as unknown as typeof fetch
    const r = await publishTikTokVideo({ newsId: 'n1', videoUrl: VIDEO, seconds: 40, settings: settings() }, target(), { fetch: f2, pollMs: 0 })
    expect(r).toMatchObject({ success: false, tiktokStatus: 'FAILED' })
    expect(r.error).toMatch(/süresi/)
  })

  it('only NaHaber storage URLs are downloaded', async () => {
    const { f, calls } = fakeFetch()
    const r = await publishTikTokVideo({ newsId: 'n1', videoUrl: 'https://evil.example.com/v.mp4', seconds: 40, settings: settings() }, target(), { fetch: f, pollMs: 0 })
    expect(r.success).toBe(false)
    expect(calls.length).toBe(0)
  })
})
