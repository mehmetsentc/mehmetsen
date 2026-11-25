import { describe, expect, it } from 'vitest'
import { GRAVE_DEFAULTS, gravityFor, safeStoryScenes, safeStoryText } from './storySafety'
import { GRAVE_NEWS_RULE, NEWS_PRESENTER_RULE, planSystemPrompt, scriptSystemPrompt, type StoryScene } from './storyProject'

const scene = (o: Partial<StoryScene>): StoryScene =>
  ({ id: 's1', text: '', highlights: [], label: null, visual: { kind: 'card' }, keepAudio: false, reason: null, need: null, headline: null, sub: null, ...o }) as StoryScene

describe('HASSAS-VIDEO: seslendirme ve ekran yazısı', () => {
  it('anlatım nötr dile çevrilir, yöntem çıkar', () => {
    expect(safeStoryText('Genç adam kendini tabancayla vurarak intihar etti.')).toBe('Genç adam hayatını kaybetti.')
    expect(safeStoryText('Kazada 2 kişi öldü.')).toBe('Kazada 2 kişi hayatını kaybetti.')
  })
  it('sahne: metin, başlık, alt satır; artık geçmeyen vurgu düşer', () => {
    const [s] = safeStoryScenes([scene({ text: 'Sürücü olay yerinde öldü.', highlights: ['öldü', 'Sürücü'], headline: 'SÜRÜCÜ ÖLDÜ!', sub: 'CESET MORGA KALDIRILDI' })], null)
    expect(s!.text).toBe('Sürücü olay yerinde hayatını kaybetti.')
    expect(s!.highlights).toEqual(['Sürücü'])
    expect(s!.headline).toBe('SÜRÜCÜ HAYATINI KAYBETTİ!')
    expect(s!.sub).toBe('CANSIZ BEDEN MORGA KALDIRILDI')
  })
  it('ağır haber: «SON DAKİKA» etiketi «HABER» olur, başlıkta ünlem kalmaz', () => {
    const [s] = safeStoryScenes([scene({ text: 'Silahlı saldırı.', label: 'Son Dakika', headline: 'SALDIRI!' })], 'agir')
    expect(s!.label).toBe('HABER')
    expect(s!.headline).toBe('SALDIRI')
    const [n] = safeStoryScenes([scene({ text: 'Belediye açıklaması.', label: 'SON DAKİKA' })], null)
    expect(n!.label).toBe('SON DAKİKA')
  })
  it('düzey → kip ve ağır haber varsayılanları', () => {
    expect(gravityFor(2)).toBe('agir')
    expect(gravityFor(3)).toBe('agir')
    expect(gravityFor(1)).toBeNull()
    expect(GRAVE_DEFAULTS).toEqual({ music: 'none', sfx: false, rate: 0.95 })
  })
  it('AI talimatı: etik kurallar her planda; haber ve ağır haber kuralı yerinde', () => {
    const plain = planSystemPrompt({ targetMin: 1, style: 'haber' })
    expect(plain).toContain('YÖNTEMİNİ')
    expect(plain).not.toContain(NEWS_PRESENTER_RULE)
    const news = planSystemPrompt({ targetMin: 1, style: 'haber', news: true, gravity: 'agir' })
    expect(news).toContain(NEWS_PRESENTER_RULE)
    expect(news).toContain(GRAVE_NEWS_RULE)
    expect(news).not.toContain('merak uyandıran bir soru')
    expect(scriptSystemPrompt(3, 'haber', { news: true, gravity: 'agir' })).toContain('AĞIR HABER')
  })
})
