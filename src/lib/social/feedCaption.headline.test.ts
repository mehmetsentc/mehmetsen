import { describe, expect, it } from 'vitest'
import {
  fitCompleteHeadline,
  isIncompleteHeadline,
  pickCompleteOgHeadline,
  shortenToLastCompleteClause,
  stripTrailingHeadlineJunk,
} from './feedCaption'

describe('complete OG headlines', () => {
  it('flags mid-phrase gerund+case endings (…ödeyerek dolara)', () => {
    const bad =
      "Vergi rekortmeni avukat Gürkaynak'tan 'şatafat' çıkışı: 7 milyon USD vergi ödeyerek dolara"
    expect(isIncompleteHeadline(bad)).toBe(true)
  })

  it('strips trailing junk after finite verb (…yaralandı çocuk)', () => {
    const bad =
      "Geyikli'de Feci Kaza: Baba Hayatını Kaybetti, 8 Yaşındaki çocuğu ağır yaralandı çocuk"
    expect(stripTrailingHeadlineJunk(bad)).toBe(
      "Geyikli'de Feci Kaza: Baba Hayatını Kaybetti, 8 Yaşındaki çocuğu ağır yaralandı",
    )
    expect(isIncompleteHeadline(bad)).toBe(true)
  })

  it('prefers complete source title over truncated AI manşet', () => {
    const ai =
      "Vergi rekortmeni avukat Gürkaynak'tan 'şatafat' çıkışı: 7 milyon USD vergi ödeyerek dolara"
    const source =
      "Vergi rekortmeni avukat Gönenç Gürkaynak'tan 'şatafat' çıkışı: 7 milyon USD vergi ödeyerek dolara meydan okudu"
    const out = pickCompleteOgHeadline(ai, source, 120, 160)
    expect(out.toLocaleLowerCase('tr-TR')).not.toMatch(/dolara$/)
    expect(isIncompleteHeadline(out)).toBe(false)
    expect(out.length).toBeGreaterThan(ai.length - 5)
  })

  it('prefers source when AI has trailing junk', () => {
    const ai =
      "Geyikli'de Feci Kaza: Baba Hayatını Kaybetti, 8 Yaşındaki çocuğu ağır yaralandı çocuk"
    const source =
      "Geyikli'de Feci Kaza: Baba Hayatını Kaybetti, 8 Yaşındaki Çocuğu Ağır Yaralı"
    const out = pickCompleteOgHeadline(ai, source, 120, 160)
    expect(out.toLocaleLowerCase('tr-TR')).not.toMatch(/yaralandı çocuk$/)
    expect(isIncompleteHeadline(out)).toBe(false)
    // Ya kaynak title ya da junk temizlenmiş AI — ikisi de tamamlanmış manşet
    expect(
      out.includes('Yaralı') || /yaralandı\s*$/i.test(out),
    ).toBe(true)
  })

  it('shortens to last complete clause instead of mid-phrase', () => {
    const long =
      "Geyikli'de Feci Kaza: Baba Hayatını Kaybetti, 8 Yaşındaki çocuğu ağır yaralandı ve ambulans gecikti"
    const out = shortenToLastCompleteClause(long, 55)
    expect(out.endsWith('Kaybetti') || out.includes('Kaybetti')).toBe(true)
    expect(isIncompleteHeadline(out)).toBe(false)
  })

  it('fitCompleteHeadline restores truncated prefix from source', () => {
    const cand = 'Balıkesir yangınına 15 hava aracı müdahale etti ağır'
    const source = 'Balıkesir yangınına 15 hava aracı müdahale etti ağır yaralı yok'
    const out = fitCompleteHeadline(cand, source, 120, 160)
    expect(out).toContain('yaralı')
    expect(isIncompleteHeadline(out)).toBe(false)
  })

  it('keeps Turkish apostrophe headlines that are complete', () => {
    const ok = "Çanakkale'de yerel seçim sonuçları açıklandı"
    expect(isIncompleteHeadline(ok)).toBe(false)
  })
})
