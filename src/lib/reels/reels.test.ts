import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: vi.fn(), getAdminStorage: vi.fn() }))
vi.mock('./renderReel', () => ({ renderReel: vi.fn() }))

import { buildTimeline, buildVoiceText, clickTimes, speakable, wrapLines, END_CARD_S, INTRO_S, TAIL_S } from './timeline'
import { audioFilterGraph, buildFxTrack, readWav, writeWav, type Pcm } from './audio'
import { reelSourceFromDoc, reelStoragePath } from './reelService'

const tone = (sec: number, sr = 44100): Pcm => {
  const data = new Float32Array(Math.round(sec * sr))
  for (let i = 0; i < data.length; i++) data[i] = 0.5 * Math.sin((2 * Math.PI * 440 * i) / sr)
  return { sampleRate: sr, data }
}

describe('REELS-1 timeline', () => {
  it('length follows the voice (no fixed limit)', () => {
    const t = buildTimeline(8.5, 52)
    expect(t.total).toBeCloseTo(INTRO_S + 8.5 + TAIL_S + END_CARD_S)
    expect(t.frames).toBe(Math.ceil(t.total * 30))
    expect(t.typeEnd).toBeGreaterThan(t.typeStart)
    expect(t.summaryStart).toBeGreaterThan(t.typeEnd)
    expect(buildTimeline(4, 30).total).toBeLessThan(buildTimeline(12, 30).total)
  })
  it('click per typed non-space char', () => {
    expect(clickTimes('ab c', 1)).toHaveLength(3)
  })
})

describe('REELS-1 voice text', () => {
  it('reads all-caps names as words', () => {
    expect(speakable('GESTAŞ seferleri')).toBe('Gestaş seferleri')
  })
  it('headline + first summary sentence, capped, no invented text', () => {
    const v = buildVoiceText('GESTAŞ Bozcaada ve Gökçeada seferlerini iptal etti', 'Olumsuz hava nedeniyle yarın seferler yapılmayacak. Şirket açıklama yaptı.')
    expect(v).toBe('Gestaş Bozcaada ve Gökçeada seferlerini iptal etti. Olumsuz hava nedeniyle yarın seferler yapılmayacak.')
    expect(buildVoiceText('Başlık', 'x'.repeat(400)).length).toBeLessThanOrEqual(220)
  })
})

describe('REELS-1 text wrap', () => {
  it('wraps and ellipsizes past maxLines', () => {
    const m = (s: string) => s.length * 10
    expect(wrapLines(m, 'aa bb cc dd', 50)).toEqual(['aa bb', 'cc dd'])
    const lines = wrapLines(m, 'aa bb cc dd ee ff', 50, 2)
    expect(lines).toHaveLength(2)
    expect(lines[1]!.endsWith('…')).toBe(true)
  })
})

describe('REELS-1 audio', () => {
  it('WAV round trip', () => {
    const p = tone(0.1)
    const back = readWav(writeWav(p))
    expect(back.sampleRate).toBe(44100)
    expect(back.data.length).toBe(p.data.length)
    expect(back.data[100]).toBeCloseTo(p.data[100]!, 3)
  })
  it('fx track spans the reel and is peak-normalized', () => {
    const fx = buildFxTrack(
      { intro: tone(1), outro: tone(1.5), click: tone(0.03), whooshUp: tone(0.5), whooshDown: tone(0.5) },
      { total: 10, summaryStart: 3, endStart: 8.2 },
      [1, 1.05, 1.1],
    )
    expect(fx.data.length).toBe(441000)
    const peak = fx.data.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    expect(peak).toBeCloseTo(0.9, 2)
  })
  it('ffmpeg graph delays the voice and ducks the bed', () => {
    const g = audioFilterGraph(0.75)
    expect(g).toContain('adelay=750|750')
    expect(g).toContain('sidechaincompress')
    expect(g).toContain('loudnorm=I=-15')
  })
})

describe('REELS-1 source mapping', () => {
  const base = { status: 'published', title: 'Başlık', summary: 'Özet.', content: 'Haber metni. '.repeat(40), categoryId: 'gundem', city: 'Çanakkale', coverImageUrl: 'https://cdn.example/a.jpg' }
  it('own content → media allowed', () => {
    const s = reelSourceFromDoc({ ...base, sourceUrl: '' })
    expect(s.mediaAllowed).toBe(true)
    expect(s.imageUrl).toBe('https://cdn.example/a.jpg')
    expect(s.place).toBe('Çanakkale')
  })
  it('external source without editor rights → brand panel', () => {
    const s = reelSourceFromDoc({ ...base, sourceUrl: 'https://www.hurriyet.com.tr/x' })
    expect(s.mediaAllowed).toBe(false)
  })
  it('editor rights decision → allowed; video stories are reel-eligible', () => {
    const s = reelSourceFromDoc({
      ...base, sourceUrl: 'https://www.hurriyet.com.tr/x', hasVideo: true, videoUrl: 'https://cdn.example/v.mp4',
      socialEligibility: { status: 'allowed', mediaRights: 'licensed', by: 'e', at: 1 },
    })
    expect(s.mediaAllowed).toBe(true)
    expect(s.videoUrl).toBe('https://cdn.example/v.mp4')
  })
  it('storage path is safe', () => {
    expect(reelStoragePath('ab/c..d')).toBe('videos/reels/ab_c__d.mp4')
  })
})

import { billedChars, decideQuota, safeCap, tierForVoice, usageMonth, TTS_FREE_CHARS } from './ttsQuotaRules'

describe('REELS-1 TTS free-tier guard', () => {
  it('maps voices to Google price tiers', () => {
    expect(tierForVoice('tr-TR-Standard-D')).toBe('standard')
    expect(tierForVoice('tr-TR-Wavenet-E')).toBe('wavenet')
    expect(tierForVoice('tr-TR-Chirp3-HD-Zubenelgenubi')).toBe('chirp')
    expect(tierForVoice('tr-TR-Neural2-A')).toBe('neural2')
    expect(tierForVoice('mystery')).toBe('chirp')
  })
  it('stops at 95% of the free tier', () => {
    expect(safeCap('standard')).toBe(3_800_000)
    expect(safeCap('chirp')).toBe(950_000)
    expect(TTS_FREE_CHARS.wavenet).toBe(4_000_000)
  })
  it('refuses past the cap unless approved for the month', () => {
    expect(decideQuota({ used: 949_900, request: 50, cap: 950_000, overageApproved: false })).toEqual({ ok: true, afterUse: 949_950, overFree: false })
    expect(decideQuota({ used: 949_900, request: 200, cap: 950_000, overageApproved: false })).toMatchObject({ ok: false, reason: 'free_tier_reached' })
    expect(decideQuota({ used: 949_900, request: 200, cap: 950_000, overageApproved: true })).toMatchObject({ ok: true, overFree: true })
  })
  it('counts characters like Google (code points, spaces included)', () => {
    expect(billedChars('Çanakkale ş')).toBe(11)
    expect(usageMonth(new Date('2026-10-31T23:00:00Z'))).toBe('2026-10')
  })
})
