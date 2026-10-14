import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: vi.fn(), getAdminStorage: vi.fn() }))
vi.mock('./renderReel', () => ({ renderReel: vi.fn() }))

import { directReel, scriptProblem, spokenForm, styleByRules } from './director'
import { DEFAULT_PERSONAS, parsePersonas, personaFor } from './personas'
import { resolveMusic, isReelIntro } from './reelOptions'
import { reelSourceFromDoc, videoUrlFromDoc } from './reelService'

const ece = DEFAULT_PERSONAS[0]!

describe('REELS-4 AI editor', () => {
  it('style by category rules', () => {
    expect(styleByRules({ categoryId: 'futbol', categoryLabel: 'Futbol' })).toBe('spor')
    expect(styleByRules({ categoryId: 'magazin', categoryLabel: 'Magazin' })).toBe('magazin')
    expect(styleByRules({ categoryId: 'finans', categoryLabel: 'Finans & Piyasa' })).toBe('analiz')
    expect(styleByRules({ categoryId: 'gundem', categoryLabel: 'Gündem', postType: 'analysis' })).toBe('analiz')
    expect(styleByRules({ categoryId: 'yerel-asayis', categoryLabel: 'Yerel Asayiş' })).toBe('haber')
  })
  it('script check: numbers must exist in the source', () => {
    const src = "Göztepe Eyüpspor'u 4-0 yendi, Henrique hat-trick yaptı"
    expect(scriptProblem("Göztepe, Eyüpspor'u 4-0 yendi; Henrique hat-trick yaptı.", src)).toBeNull()
    expect(scriptProblem("Göztepe, Eyüpspor'u 5-0 yendi ve liderliğe yükseldi.", src)).toMatch(/number_not_in_source/)
    expect(scriptProblem('Kısa', src)).toBe('too_short')
    expect(scriptProblem('Göztepe kazandı, detaylar için https://x.com adresine bakın lütfen.', src)).toBe('bad_chars')
  })
  it('spoken form reads scores and all-caps names naturally', () => {
    expect(spokenForm('GESTAŞ duyurdu: Göztepe 4-0 kazandı.')).toBe('Gestaş duyurdu: Göztepe 4 0 kazandı.')
  })
  it('uses the LLM script when safe, falls back to rules otherwise', async () => {
    const input = { title: "Göztepe Eyüpspor'u 4-0 yendi", summary: 'Henrique hat-trick yaptı.', categoryId: 'futbol', categoryLabel: 'Futbol' }
    const good = await directReel(input, ece, async () => JSON.stringify({ style: 'spor', script: "Göztepe, Eyüpspor'u 4-0 yendi! Henrique hat-trick yaptı." }))
    expect(good).toMatchObject({ source: 'ai', style: 'spor' })
    expect(good.voiceText).toContain('4 0')
    const bad = await directReel(input, ece, async () => JSON.stringify({ style: 'spor', script: "Göztepe, Eyüpspor'u 7-0 yendi ve rekor kırdı!" }))
    expect(bad.source).toBe('rules')
    const broken = await directReel(input, ece, async () => 'not json')
    expect(broken.source).toBe('rules')
    expect((await directReel(input, ece, null)).source).toBe('rules')
  })
})

describe('REELS-4 personas & options', () => {
  it('defaults, parsing and style mapping', () => {
    expect(parsePersonas(null).map((p) => p.id)).toEqual(['ece', 'kerem', 'selin', 'deniz'])
    expect(parsePersonas([{ id: 'BAD ID', name: 'x', voice: 'tr-TR-Standard-A' }]).length).toBe(4) // invalid → defaults
    const custom = parsePersonas([{ id: 'ayse', name: 'Ayşe', voice: 'tr-TR-Wavenet-A', styles: ['haber', 'nope'], rate: 9, photoUrl: 'http://x' }])
    expect(custom[0]).toMatchObject({ id: 'ayse', styles: ['haber'], rate: 1.5, photoUrl: null })
    expect(personaFor(DEFAULT_PERSONAS, 'spor').id).toBe('kerem')
    expect(personaFor(DEFAULT_PERSONAS, 'spor', 'deniz').id).toBe('deniz')
  })
  it('music resolution and option guards', () => {
    expect(resolveMusic('auto', 'spor')).toBe('enerjik')
    expect(resolveMusic(undefined, 'haber', true)).toBe('sondakika')
    expect(resolveMusic('none', 'haber')).toBeNull()
    expect(resolveMusic('lofi', 'haber')).toBe('lofi')
    expect(isReelIntro('perde')).toBe(true)
    expect(isReelIntro('boom')).toBe(false)
  })
  it('video from mediaItems and studio media approval', () => {
    const d = { title: 'T', status: 'published', categoryId: 'gundem', mediaItems: [{ type: 'image', url: 'https://x/a.jpg' }, { type: 'video', url: 'https://x/v.mp4' }] }
    expect(videoUrlFromDoc(d)).toBe('https://x/v.mp4')
    const src = reelSourceFromDoc({ ...d, sourceUrl: 'https://other.example/x', reelMediaApproval: { by: 'u1', at: 1 } })
    expect(src.mediaAllowed).toBe(true)
  })
  it('«always use media» policy: video first, else image; nothing to use → brand panel', () => {
    const agency = { title: 'T', status: 'published', categoryId: 'gundem', thumbnail: 'https://cdn.agency.example/a.jpg', sourceUrl: 'https://agency.example/x' }
    expect(reelSourceFromDoc(agency).mediaAllowed).toBe(false)
    const withPolicy = reelSourceFromDoc(agency, { alwaysUseMedia: true })
    expect(withPolicy).toMatchObject({ mediaAllowed: true, mediaBasis: 'studio_policy', videoUrl: null })
    const both = reelSourceFromDoc({ ...agency, videoUrl: 'https://cdn.agency.example/v.mp4' }, { alwaysUseMedia: true })
    expect(both.videoUrl).toBe('https://cdn.agency.example/v.mp4')
    expect(reelSourceFromDoc({ title: 'T', status: 'published' }, { alwaysUseMedia: true }).mediaAllowed).toBe(false)
  })
})
