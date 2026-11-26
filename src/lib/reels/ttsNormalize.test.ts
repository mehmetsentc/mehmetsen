import { describe, expect, it } from 'vitest'
import { sanitizeLexicon, toSpokenTurkish } from './ttsNormalize'

describe('seslendirmede ölüm / intihar dili (26.11.2026)', () => {
  it('ölü bulunan, ölüm ve intihar söylenmez', () => {
    const out = toSpokenTurkish('Evinde ölü bulunan adamın ölümü araştırılıyor. Genç kız intihar etti.')
    expect(out).toContain('hayatını kaybetmiş olarak bulunan')
    expect(out).toContain('vefatı')
    expect(out).toContain('yaşamına son verdi')
    expect(/(?<![\p{L}])(?:öl(?:ü|d|m|e)|intihar)/iu.test(out)).toBe(false)
  })
})

describe('yabancı kısaltma ve adlar (26.11.2026)', () => {
  it('BBC, CNN İngilizce harf adlarıyla, ek uyumlu', () => {
    expect(toSpokenTurkish("BBC'nin haberine göre")).toBe('Bi Bi Sinin haberine göre.')
    expect(toSpokenTurkish("CNN'e konuşan yetkili")).toBe('Si En Ene konuşan yetkili.')
    expect(toSpokenTurkish('CNN Türk ve BBC Türkçe')).toBe('Si En En Türk ve Bi Bi Si Türkçe.')
  })
  it('Türkçe kısaltmalar eskisi gibi', () => {
    expect(toSpokenTurkish('CHP açıklama yaptı')).toBe('Ce He Pe açıklama yaptı.')
    expect(toSpokenTurkish('MİT operasyonu')).toBe('Mit operasyonu.')
  })
  it('Phu Quoc ve ph/q içeren adlar', () => {
    expect(toSpokenTurkish("Phu Quoc'ta tatil")).toBe('Fu Kuokta tatil.')
    expect(toSpokenTurkish('Philadelphia ve Qatar')).toBe('Filadelfia ve Katar.')
    expect(toSpokenTurkish("Reuters'a göre Washington'da")).toBe('Roytırsa göre Vaşingtonda.')
  })
})

describe('genel yabancı ad sözlüğü (yapay zekâ çıktısı süzgeci)', () => {
  const text = "Elon Musk, Tesla'nın Shanghai fabrikasını ziyaret etti. CHP ve MİT açıklama yaptı. Kalem."
  it('geçerli kayıtları alır, Türkiye kısaltmalarını ve uydurmaları atar', () => {
    const lex = sanitizeLexicon({ items: [
      { w: 'Elon Musk', s: 'İlon Mask' },
      { w: 'Tesla', s: 'Tesla' },
      { w: 'MİT', s: 'Em Ay Ti' },
      { w: 'Kalem', s: 'Kelem' },
      { w: 'kalem', s: 'x' },
      { w: 'Netflix', s: 'Netfliks' },
      { w: 'Shanghai', s: '<b>Şanghay</b>' },
      { w: 'CHP', s: 'Si Eyç Pi' },
    ] }, text)
    expect(lex).toEqual({ 'Elon Musk': 'İlon Mask', Kalem: 'Kelem' })
  })
  it('sözlük seste uygulanır, Türkçe ek korunur', () => {
    const out = toSpokenTurkish("Elon Musk'ın açıklaması Wall Street'i salladı", { 'Elon Musk': 'İlon Mask' })
    expect(out).toBe('İlon Maskın açıklaması Vol Striti salladı.')
  })
})
