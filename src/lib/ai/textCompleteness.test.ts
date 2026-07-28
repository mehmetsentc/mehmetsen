import { describe, expect, it } from 'vitest'
import {
  contentHasIncompleteSegments,
  shortHeadingFromCaption,
  textLooksIncomplete,
  titleLooksIncomplete,
} from '@/lib/ai/textCompleteness'

describe('textLooksIncomplete', () => {
  it('flags mid-sentence cuts like the CMS AI preview bugs', () => {
    expect(
      textLooksIncomplete(
        "Güney Kore'deki bir sağlık merkezinde akıllı cihazlar ve dijital ekranlar eşliğinde gerçek"
      )
    ).toBe(true)
    expect(
      textLooksIncomplete(
        "Güney Kore'deki bir sağlık merkezinde görevli personel, check-up programına katılan yabancı"
      )
    ).toBe(true)
    expect(textLooksIncomplete('...temposuna sahip veya kısıtlı tatil süresi olan gezginler için büyük bir avantaj oluşturuyor.')).toBe(true)
    expect(textLooksIncomplete('Polip tespit edildikten sonra müdahale edildi ve')).toBe(true)
  })

  it('accepts complete sentences and short headings', () => {
    expect(
      textLooksIncomplete(
        'Güney Kore sağlık turizminde check-up paketleriyle öne çıkıyor.'
      )
    ).toBe(false)
    expect(textLooksIncomplete('Düşük maliyet ve hızlı hizmet', { allowShortHeading: true })).toBe(false)
  })
})

describe('titleLooksIncomplete', () => {
  it('accepts normal news headlines without a trailing period', () => {
    expect(
      titleLooksIncomplete("TÜVTÜRK'te üst düzey iki atama: CFO ve Risk Direktörü belirlendi")
    ).toBe(false)
    expect(titleLooksIncomplete("CHP'de Grup Toplantısı Krizi: İki Taraf da Meclis'te")).toBe(false)
  })

  it('flags truncated or conjunction-ended titles', () => {
    expect(titleLooksIncomplete('CHP grup toplantısı ve')).toBe(true)
    expect(titleLooksIncomplete('Son dakika gelişme…')).toBe(true)
    expect(titleLooksIncomplete('')).toBe(true)
  })
})

describe('shortHeadingFromCaption', () => {
  it('does not mid-slice long captions into headings', () => {
    const long =
      "Güney Kore'deki bir sağlık merkezinde akıllı cihazlar ve dijital ekranlar eşliğinde gerçekleştirilen check-up süreci."
    const heading = shortHeadingFromCaption(long, 'Güney Kore sağlık turizmi canlanıyor', 'Haber')
    expect(heading.length).toBeLessThanOrEqual(55)
    expect(heading.endsWith('gerçek')).toBe(false)
    expect(heading).not.toContain('akıllı cihazlar ve dijital')
  })
})

describe('contentHasIncompleteSegments', () => {
  it('detects truncated markdown bodies', () => {
    expect(
      contentHasIncompleteSegments(
        '## Turizm\n\nLiping C’nin midesinde poli tespit edildikten sonra müdahale edildi ve'
      )
    ).toBe(true)
  })
})
