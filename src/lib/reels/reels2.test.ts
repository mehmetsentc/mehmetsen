import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: vi.fn(), getAdminStorage: vi.fn() }))

import { clampRate, isValidVoiceName, parseVoiceSettings, previewText, resolveReelVoice, sortVoices, STATIC_TR_VOICES, PREVIEW_TEXT_MAX } from './voiceRules'
import { formatsForMode, requiredFormats, supportedFormats, supportsReel } from '@/lib/social/accounts/capabilities'
import { buildReelCaption } from '@/lib/social/reelPublish'
import { publishFacebookReel, publishInstagramReel } from '@/lib/social/reelAdapters'
import { apiBaseFor } from '@/lib/social/accounts/apiHosts'
import type { FacebookPublishTarget, InstagramPublishTarget } from '@/lib/social/accounts/targetTypes'

describe('REELS-2 voice rules', () => {
  it('accepts Google Turkish voice names only', () => {
    expect(isValidVoiceName('tr-TR-Standard-D')).toBe(true)
    expect(isValidVoiceName('tr-TR-Chirp3-HD-Kore')).toBe(true)
    expect(isValidVoiceName('en-US-Standard-A')).toBe(false)
    expect(isValidVoiceName('tr-TR-Standard-D; drop')).toBe(false)
    expect(isValidVoiceName(42)).toBe(false)
  })
  it('clamps the speaking rate', () => {
    expect(clampRate(3)).toBe(1.5)
    expect(clampRate(0.1)).toBe(0.75)
    expect(clampRate('1.1')).toBe(1.1)
    expect(clampRate('x')).toBeNull()
  })
  it('parses settings and drops invalid entries', () => {
    const s = parseVoiceSettings({ defaultVoice: 'bad', rate: 9, categoryVoices: { spor: 'tr-TR-Wavenet-B', 'BAD KEY': 'tr-TR-Standard-A', ekonomi: 'nope' } })
    expect(s.defaultVoice).toBeNull()
    expect(s.rate).toBe(1.5)
    expect(s.categoryVoices).toEqual({ spor: 'tr-TR-Wavenet-B' })
  })
  it('precedence: reel > category > default > env > builtin', () => {
    const settings = parseVoiceSettings({ defaultVoice: 'tr-TR-Standard-A', categoryVoices: { spor: 'tr-TR-Wavenet-B' } })
    const env = { voice: 'tr-TR-Standard-E', rate: 1.05 }
    expect(resolveReelVoice({ settings, env, categoryId: 'spor', override: { voice: 'tr-TR-Chirp3-HD-Kore' } })).toMatchObject({ voice: 'tr-TR-Chirp3-HD-Kore', source: 'reel' })
    expect(resolveReelVoice({ settings, env, categoryId: 'spor' })).toMatchObject({ voice: 'tr-TR-Wavenet-B', source: 'category' })
    expect(resolveReelVoice({ settings, env, categoryId: 'gundem' })).toMatchObject({ voice: 'tr-TR-Standard-A', source: 'default' })
    expect(resolveReelVoice({ settings: parseVoiceSettings(null), env })).toMatchObject({ voice: 'tr-TR-Standard-E', source: 'env' })
    expect(resolveReelVoice({ settings: parseVoiceSettings(null), env: {} })).toMatchObject({ voice: 'tr-TR-Standard-D', source: 'builtin', rate: 1.05 })
  })
  it('static catalog is sorted cheapest tier first and preview text is capped', () => {
    const sorted = sortVoices(STATIC_TR_VOICES)
    expect(sorted[0]!.tier).toBe('standard')
    expect(sorted.at(-1)!.tier).toBe('chirp')
    expect(sorted.some((v) => v.name === 'tr-TR-Standard-D')).toBe(true)
    expect(previewText('  ')).toMatch(/NaHaber/)
    expect(previewText('a'.repeat(500))).toHaveLength(PREVIEW_TEXT_MAX)
  })
})

describe('REELS-2 capabilities', () => {
  const ig = { platform: 'instagram' as const, connectionMethod: 'facebook_login' as const, platformAccountType: 'BUSINESS' }
  const fb = { platform: 'facebook' as const, connectionMethod: 'facebook_login' as const, platformAccountType: null }
  const th = { platform: 'threads' as const, connectionMethod: 'threads_oauth' as const, platformAccountType: null }
  it('reel is supported on IG/FB, not Threads, and never leaks into post/story formats', () => {
    expect(supportsReel(ig)).toBe(true)
    expect(supportsReel(fb)).toBe(true)
    expect(supportsReel(th as never)).toBe(false)
    expect(supportedFormats(ig)).toEqual(['post', 'story'])
    expect(formatsForMode(ig, 'reel')).toEqual(['reel'])
    expect(formatsForMode(th as never, 'reel')).toEqual([])
    expect(requiredFormats('instagram', 'reel')).toEqual(['reel'])
  })
})

describe('REELS-2 caption', () => {
  it('title, short summary, link and plain hashtags', () => {
    const c = buildReelCaption({ title: 'Başlık', summary: 'Özet cümlesi. ' + 'x'.repeat(400), city: 'Çanakkale' }, 'https://www.nahaber.com/haber/x')
    expect(c.startsWith('Başlık\n\n')).toBe(true)
    expect(c).toContain('Haberin tamamı: https://www.nahaber.com/haber/x')
    expect(c).toContain('#Çanakkale')
    expect(c.length).toBeLessThan(500)
  })
})

function withToken<T extends object>(t: T): T {
  Object.defineProperty(t, 'accessToken', { value: 'tok', enumerable: false })
  return t
}

describe('REELS-2 Meta reel adapters', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })
  const res = (json: unknown, status = 200) => ({ status, ok: status < 400, json: async () => json }) as Response

  it('Instagram: container → poll FINISHED → media_publish', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const fetchMock = vi.fn(async (url: string) => {
      calls.push(url)
      if (url.endsWith('/media')) return res({ id: 'c1' })
      if (url.includes('/c1?fields=status_code')) return res({ status_code: calls.length > 2 ? 'FINISHED' : 'IN_PROGRESS' })
      if (url.endsWith('/media_publish')) return res({ id: 'm1' })
      return res({ error: { message: 'x' } }, 400)
    })
    vi.stubGlobal('fetch', fetchMock)
    const target = withToken({ platform: 'instagram', accountId: 'a1', connectionMethod: 'facebook_login', apiBase: apiBaseFor('instagram', 'facebook_login')!, igUserId: '1789' }) as InstagramPublishTarget
    const p = publishInstagramReel({ newsId: 'n1', videoUrl: 'https://storage.googleapis.com/b/v.mp4', caption: 'c' }, target)
    await vi.advanceTimersByTimeAsync(20_000)
    await expect(p).resolves.toEqual({ success: true, platformId: 'm1' })
    expect(calls.filter((u) => u.includes('status_code')).length).toBe(2)
  })

  it('Instagram: refuses a non-https video URL without calling Meta', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const target = withToken({ platform: 'instagram', accountId: 'a1', connectionMethod: 'facebook_login', apiBase: apiBaseFor('instagram', 'facebook_login')!, igUserId: '1789' }) as InstagramPublishTarget
    const r = await publishInstagramReel({ newsId: 'n1', videoUrl: 'http://x/v.mp4', caption: 'c' }, target)
    expect(r.success).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Facebook: start → rupload file_url → finish PUBLISHED', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      seen.push({ url, init })
      if (url.includes('rupload.facebook.com')) return res({ success: true })
      const body = String(init?.body ?? '')
      if (body.includes('upload_phase=start')) return res({ video_id: 'v9' })
      if (body.includes('upload_phase=finish')) return res({ success: true })
      return res({}, 400)
    }))
    const target = withToken({ platform: 'facebook', accountId: 'p1', connectionMethod: 'facebook_login', apiBase: apiBaseFor('facebook', 'facebook_login')!, pageId: '1234', legacyCredentialMode: null, appId: null, appName: null }) as FacebookPublishTarget
    const r = await publishFacebookReel({ newsId: 'n1', videoUrl: 'https://storage.googleapis.com/b/v.mp4', caption: 'c' }, target)
    expect(r).toEqual({ success: true, platformId: 'v9' })
    const up = seen.find((s) => s.url.includes('rupload'))!
    expect((up.init?.headers as Record<string, string>).file_url).toBe('https://storage.googleapis.com/b/v.mp4')
    expect(String(seen.at(-1)!.init?.body)).toContain('video_state=PUBLISHED')
  })
})
