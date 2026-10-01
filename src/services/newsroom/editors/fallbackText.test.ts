import { describe, expect, it } from 'vitest'
import { cutAtSentence, cutAtWord } from './fallbackText'

const TITLE = 'Yeni Partili Özgür Karabat: Ziraat Bankası Tera için neden yıllardır teminat sağlıyor?'
const SUMMARY =
  "Yeni Parti İstanbul Milletvekili Özgür Karabat, Ziraat Bankası'nın Tera Yatırım için 2024'ten bu yana Borsa Para Piyasası'na teminat mektubu verdiğini öne sürerek soru önergesi verdi."

describe('stage-1 raw fallback trimming', () => {
  it('cutAtWord never ends mid-word', () => {
    const out = cutAtWord(TITLE, 65)
    expect(out.length).toBeLessThanOrEqual(65)
    expect(TITLE.startsWith(out)).toBe(true)
    expect(TITLE.charAt(out.length)).toMatch(/\s/)
    expect(out.endsWith('t')).toBe(false)
  })

  it('cutAtWord returns short text unchanged', () => {
    expect(cutAtWord('Kısa başlık', 65)).toBe('Kısa başlık')
  })

  it('cutAtSentence keeps a whole first sentence instead of "… Borsa Para"', () => {
    const out = cutAtSentence(SUMMARY, 120)
    expect(out).toBe(SUMMARY)
  })

  it('cutAtSentence picks the last complete sentence within the limit', () => {
    const text = 'Birinci cümle burada bitiyor. İkinci cümle de kısa. Üçüncü cümle çok uzun ve sınırın ötesine taşıyor.'
    expect(cutAtSentence(text, 60)).toBe('Birinci cümle burada bitiyor. İkinci cümle de kısa.')
  })

  it('cutAtSentence marks a forced word cut with an ellipsis', () => {
    const text = 'a'.repeat(5) + ' ' + 'kelime '.repeat(80)
    const out = cutAtSentence(text, 100)
    expect(out.endsWith('…')).toBe(true)
    expect(out.length).toBeLessThanOrEqual(100)
    expect(out.slice(0, -1)).not.toMatch(/\s$/)
  })
})
