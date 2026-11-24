import { describe, expect, it } from 'vitest'
import {
  citySlugOf,
  parseCityBranding,
  resolveCityBranding,
  suggestCityProfiles,
  VOICE_POOL,
} from './cityBranding'
import { DEFAULT_PERSONAS } from './personas'
import { TURKISH_PROVINCES } from '@/constants/cities'

const ece = DEFAULT_PERSONAS.find((p) => p.id === 'ece')!
const kerem = DEFAULT_PERSONAS.find((p) => p.id === 'kerem')!

const branding = parseCityBranding({
  enabled: true,
  cities: {
    antalya: { presenterName: 'Defne', voice: 'tr-TR-Chirp3-HD-Leda', rate: 1.04, music: 'akustik', accent: '#00ACC1' },
    ankara: { presenterName: 'Emre', voice: 'tr-TR-Wavenet-B', accent: '#5e35b1' },
  },
})

describe('cityBranding', () => {
  it('kapalıyken hiçbir şeyi değiştirmez', () => {
    const d = resolveCityBranding({ branding: { ...branding, enabled: false }, citySlug: 'antalya', style: 'haber', breaking: false, persona: ece })
    expect(d.persona).toBe(ece)
    expect(d.music).toBeNull()
    expect(d.accent).toBeNull()
  })

  it('gündem haberi ilin sunucusu, rengi ve müziğiyle', () => {
    const d = resolveCityBranding({ branding, citySlug: 'antalya', cityName: 'Antalya', style: 'haber', breaking: false, persona: ece })
    expect(d.persona.name).toBe('Defne')
    expect(d.persona.title).toBe('NaHaber Antalya')
    expect(d.persona.voice).toBe('tr-TR-Chirp3-HD-Leda')
    expect(d.persona.rate).toBe(1.04)
    expect(d.persona.useGemini).toBe(false)
    expect(d.music).toBe('akustik')
    expect(d.accent).toBe('#00acc1')
    expect(d.source).toEqual({ voice: 'city', music: 'city', accent: 'city' })
  })

  it('spor her ilde aynı spor sunucusuyla, renk yine ilin', () => {
    const d = resolveCityBranding({ branding, citySlug: 'antalya', style: 'spor', breaking: false, persona: kerem })
    expect(d.persona).toBe(kerem)
    expect(d.source.voice).toBe('group')
    expect(d.accent).toBe('#00acc1')
  })

  it('kategori müziği il müziğinden önce gelir', () => {
    const b = parseCityBranding({ ...branding, enabled: true, cities: { antalya: { music: 'akustik', voice: 'tr-TR-Wavenet-A' } }, groups: { analiz: { music: 'kurumsal' } } })
    const d = resolveCityBranding({ branding: b, citySlug: 'antalya', style: 'analiz', breaking: false, persona: ece })
    expect(d.music).toBe('kurumsal')
    expect(d.source.music).toBe('group')
  })

  it('son dakikada kırmızı ve son dakika müziği korunur (karar boş döner)', () => {
    const d = resolveCityBranding({ branding, citySlug: 'antalya', style: 'haber', breaking: true, persona: ece })
    expect(d.accent).toBeNull()
    expect(d.music).toBeNull()
    expect(d.persona.name).toBe('Defne')
  })

  it('profili olmayan il ve ulusal haber mevcut sunucuyla', () => {
    expect(resolveCityBranding({ branding, citySlug: 'van', style: 'haber', breaking: false, persona: ece }).persona).toBe(ece)
    expect(resolveCityBranding({ branding, citySlug: null, style: 'haber', breaking: false, persona: ece }).persona).toBe(ece)
  })

  it('geçersiz değerleri atar', () => {
    const b = parseCityBranding({ enabled: true, cities: { antalya: { voice: 'kötü ses', accent: 'red', music: 'rock', rate: 9 }, 'Kötü Slug': { voice: 'tr-TR-Wavenet-A' } } })
    expect(b.cities.antalya).toEqual({ presenterName: null, voice: null, rate: 1.3, music: null, accent: null })
    expect(Object.keys(b.cities)).toEqual(['antalya'])
    expect(b.groups.spor.sameEverywhere).toBe(true)
  })

  it('il anahtarını citySlug ya da il adından bulur', () => {
    expect(citySlugOf({ citySlug: 'antalya' }, TURKISH_PROVINCES)).toBe('antalya')
    expect(citySlugOf({ city: 'İzmir' }, TURKISH_PROVINCES)).toBe('izmir')
    expect(citySlugOf({}, TURKISH_PROVINCES)).toBeNull()
  })

  it('81 il önerisi: her ile ses, renk, ad; komşular çoğunlukla farklı', () => {
    const s = suggestCityProfiles(TURKISH_PROVINCES)
    expect(Object.keys(s)).toHaveLength(TURKISH_PROVINCES.length)
    for (const p of Object.values(s)) {
      expect(VOICE_POOL.map((v) => v.voice)).toContain(p.voice)
      expect(p.accent).toMatch(/^#[0-9a-f]{6}$/)
      expect(p.presenterName).toBeTruthy()
    }
    // Her ilin en yakın komşusu aynı sesi almamalı
    let same = 0
    const list = [...TURKISH_PROVINCES]
    for (const a of list) {
      const nearest = list
        .filter((b) => b.slug !== a.slug)
        .sort((x, y) => (x.lat - a.lat) ** 2 + (x.lng - a.lng) ** 2 - ((y.lat - a.lat) ** 2 + (y.lng - a.lng) ** 2))[0]!
      if (s[nearest.slug]!.voice === s[a.slug]!.voice) same++
    }
    expect(same).toBeLessThanOrEqual(4)
  })

  it('öneri mevcut profili korur', () => {
    const keep = { antalya: { presenterName: 'Defne', voice: 'tr-TR-Wavenet-A', rate: 1, music: null, accent: '#123456' } }
    expect(suggestCityProfiles(TURKISH_PROVINCES, keep).antalya).toEqual(keep.antalya)
  })
})
