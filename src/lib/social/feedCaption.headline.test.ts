import { describe, expect, it } from 'vitest'
import {
  clampCompleteSentences,
  endsWithCompleteSentence,
  fitCompleteHeadline,
  isIncompleteCaption,
  isIncompleteHeadline,
  isThinSocialCaption,
  overlayHeadlineFromTitle,
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

  it('flags -dikten/-ınca/-meden ulaç kesimleri (…denize girdikten)', () => {
    const cut =
      "Bozcaada'da kayıp Uğur Savaş için arama çalışmaları 3. gününde Bozcaada'da denize girdikten"
    expect(isIncompleteHeadline(cut)).toBe(true)
    expect(isIncompleteHeadline("Arama çalışmaları başladıktan")).toBe(true)
    expect(isIncompleteHeadline('Kayıp denizci bulununca')).toBe(true)
    expect(isIncompleteHeadline('Ekipler sahile inmeden')).toBe(true)
    expect(isIncompleteHeadline('Fırtına çıkarken')).toBe(true)
    // Tamamlanmış manşetler false positive olmasın
    expect(isIncompleteHeadline("Çanakkale'de yerel seçim sonuçları açıklandı")).toBe(false)
    expect(
      isIncompleteHeadline("Bozcaada'da kayıp Uğur Savaş için arama çalışmaları 3. gününde"),
    ).toBe(false)
  })

  it('prefers source title over …girdikten AI manşet', () => {
    const ai =
      "Bozcaada'da kayıp Uğur Savaş için arama çalışmaları 3. gününde Bozcaada'da denize girdikten"
    const source =
      "Bozcaada'da kayıp Uğur Savaş için arama çalışmaları 3. gününde devam ediyor"
    const out = pickCompleteOgHeadline(ai, source, 120, 160)
    expect(out.toLocaleLowerCase('tr-TR')).not.toMatch(/girdikten\s*$/)
    expect(isIncompleteHeadline(out)).toBe(false)
    expect(out).toContain('devam ediyor')
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

  it('prefers source title over invented AI overlay headline', () => {
    const ai = 'Şok gelişme: herkes bunu konuşuyor'
    const source = "Çanakkale'de feribot seferleri fırtına nedeniyle iptal edildi"
    expect(pickCompleteOgHeadline(ai, source, 120, 160)).toBe(source)
  })

  it('prefers source title over mashed Bozcaada overlay', () => {
    const ai =
      "Bozcaada'da Denizde Hareketsiz Bulunan 73 Yaşındaki tatilci kişinin yeniden hayata Tatilci Hayatını Kaybetti kişinin"
    const source =
      "Bozcaada'da Denizde Hareketsiz Bulunan 73 Yaşındaki Tatilci Hayatını Kaybetti"
    expect(pickCompleteOgHeadline(ai, source, 120, 160)).toBe(source)
  })

  it('overlayHeadlineFromTitle uses the news title', () => {
    const source =
      "Bozcaada'da Denizde Hareketsiz Bulunan 73 Yaşındaki Tatilci Hayatını Kaybetti"
    expect(overlayHeadlineFromTitle(source)).toBe(source)
  })
})

describe('complete captions (Meta AI / Dr. abbrev)', () => {
  it('does not treat Dr. as a complete sentence end', () => {
    const cut =
      "Türkiye'nin 2025 gelir vergisi rekortmenleri açıklandı; listede 23. sırada yer alan avukat Dr."
    expect(endsWithCompleteSentence(cut)).toBe(false)
    expect(isIncompleteCaption(cut)).toBe(true)
  })

  it('clampCompleteSentences skips Dr. and 23. false sentence ends', () => {
    const full =
      "Türkiye'nin 2025 gelir vergisi rekortmenleri açıklandı. Listede 23. sırada yer alan avukat Dr. Gönenç Gürkaynak dikkat çeken bir çıkış yaptı."
    const out = clampCompleteSentences(full, 110, 140)
    expect(out.toLocaleLowerCase('tr-TR')).not.toMatch(/avukat dr\.?\s*$/)
    expect(isIncompleteCaption(out)).toBe(false)
    expect(endsWithCompleteSentence(out) || out.includes('açıklandı')).toBe(true)
  })

  it('flags thin Meta AI vs rich DeepSeek body', () => {
    const meta =
      "📊 Türkiye'nin 2025 gelir vergisi rekortmenleri açıklandı; listede 23. sırada yer alan avukat Dr."
    const deepseek =
      "🔥 Bigalı vergi rekortmeni avukat Dr. Gönenç Gürkaynak listede 23. sırada yer aldı.\n\nAçıklamasında şatafat eleştirilerine yanıt verdi ve vergi ödeyerek dolara meydan okuduğunu söyledi.\n\nDetaylar yerel gündemde geniş yer buldu."
    expect(isThinSocialCaption(meta, deepseek)).toBe(true)
  })

  it('accepts a complete mid-length caption', () => {
    const ok =
      "📊 Türkiye'nin 2025 gelir vergisi rekortmenleri açıklandı. Listede 23. sırada yer alan avukat Dr. Gönenç Gürkaynak dikkat çeken bir çıkış yaptı."
    expect(isIncompleteCaption(ok)).toBe(false)
    expect(isThinSocialCaption(ok)).toBe(false)
  })
})
