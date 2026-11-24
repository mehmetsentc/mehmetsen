/** BRAND-CITY-1 — planReel: haberin iline göre sunucu / müzik / renk; spor her ilde aynı. */
import { describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ settings: {} as Record<string, unknown> }))
vi.mock('@/lib/firebase/admin', () => ({ getAdminFirestore: () => ({}), getAdminStorage: () => ({}) }))
vi.mock('./directorLlm', () => ({ reelsEditorLlm: () => null }))
vi.mock('./voiceSettings', async () => {
  const { parseVoiceSettings } = await import('./voiceRules')
  return { getReelVoiceSettings: async () => parseVoiceSettings(h.settings) }
})

import { planReel, type ReelSource } from './reelService'

const src = (over: Partial<ReelSource>): ReelSource => ({
  headline: 'Konyaaltı sahilinde yeni yürüyüş yolu açıldı',
  summary: 'Belediye, 3 kilometrelik yolun hafta sonu hizmete gireceğini açıkladı.',
  body: 'Belediye, 3 kilometrelik yolun hafta sonu hizmete gireceğini açıkladı. Yol sahil boyunca uzanıyor.',
  category: 'Yerel Gündem',
  categoryId: 'yerel-gundem',
  place: 'Antalya',
  imageUrl: null,
  videoUrl: null,
  mediaAllowed: false,
  mediaBasis: 'x',
  breaking: false,
  postType: null,
  citySlug: 'antalya',
  ...over,
})

const branding = {
  enabled: true,
  cities: { antalya: { presenterName: 'Defne', voice: 'tr-TR-Chirp3-HD-Leda', rate: 1.04, music: 'akustik', accent: '#00acc1' } },
}

describe('planReel + il profili', () => {
  it('kapalıyken eski davranış', async () => {
    h.settings = { cityBranding: { ...branding, enabled: false } }
    const p = await planReel(src({}))
    expect(p.persona.id).toBe('ece')
    expect(p.accent).toBeNull()
    expect(p.music).toBe('auto')
  })

  it('Antalya gündem haberi: Defne, ilin sesi, akustik, il rengi', async () => {
    h.settings = { cityBranding: branding }
    const p = await planReel(src({}))
    expect(p.persona.name).toBe('Defne')
    expect(p.persona.title).toBe('NaHaber Antalya')
    expect(p.voice).toBe('tr-TR-Chirp3-HD-Leda')
    expect(p.rate).toBe(1.04)
    expect(p.music).toBe('akustik')
    expect(p.accent).toBe('#00acc1')
  })

  it('Antalya spor haberi: her ilde aynı spor sunucusu, renk ilin', async () => {
    h.settings = { cityBranding: branding }
    const p = await planReel(src({ headline: 'Antalyaspor deplasmanda 2-1 kazandı', summary: 'Antalyaspor ligde 2-1 galip geldi.', body: 'Antalyaspor ligde 2-1 galip geldi.', category: 'Spor', categoryId: 'spor' }))
    expect(p.style).toBe('spor')
    expect(p.persona.id).toBe('kerem')
    expect(p.accent).toBe('#00acc1')
  })

  it('son dakika: il sunucusu ama kırmızı ve son dakika müziği korunur', async () => {
    h.settings = { cityBranding: branding }
    const p = await planReel(src({ breaking: true }))
    expect(p.accent).toBeNull()
    expect(p.music).toBe('auto')
  })

  it('stüdyoda elle seçilen sunucu ve müzik önce gelir', async () => {
    h.settings = { cityBranding: branding }
    const p = await planReel(src({}), { personaId: 'deniz', music: 'kurumsal' })
    expect(p.persona.id).toBe('deniz')
    expect(p.music).toBe('kurumsal')
  })
})
