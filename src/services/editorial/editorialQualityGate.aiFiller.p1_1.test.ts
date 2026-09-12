import { describe, expect, it } from 'vitest'
import { validateEditorialCandidate } from './editorialQualityGate'

/**
 * AI STYLE P1.1 — Task 7 / 11 / 15
 * Deterministic AI-filler / clickbait-template detection added to the existing
 * editorial quality gate. No new AI calls; no schema change.
 */
describe('AI STYLE P1.1 — AI filler / clickbait template detection', () => {
  const longEnoughBody = (extra: string) =>
    `${extra} Yetkililer olay yerine sevk edildi. Soruşturma başlatıldığı belirtildi. ` +
    'Konuyla ilgili açıklama yapan yetkililer detayları paylaştı. Olayla ilgili soruşturma sürüyor. '.repeat(3)

  it('flags known AI-filler template phrases in the body', () => {
    const res = validateEditorialCandidate({
      title: 'Kentte trafik kazası: İki araç çarpıştı',
      body: longEnoughBody('Olay büyük yankı uyandırdı ve vatandaşlar tarafından yakından takip ediliyor.'),
    })
    expect(res.issues).toContain('AI_FILLER_LANGUAGE')
    expect(res.passed).toBe(false)
  })

  it('flags forbidden empty AI-lead opener ("son günlerde yaşanan gelişmeler")', () => {
    const res = validateEditorialCandidate({
      title: 'Ekonomide yeni düzenleme yürürlüğe girdi',
      body: longEnoughBody('Son günlerde yaşanan gelişmeler ülke gündemini meşgul ediyor.'),
    })
    expect(res.issues).toContain('AI_FILLER_LANGUAGE')
  })

  it('flags clickbait template phrases in the title', () => {
    const res = validateEditorialCandidate({
      title: 'Şok iddia: Belediye başkanından açıklama geldi',
      body: longEnoughBody('Belediye başkanı konuya ilişkin resmi açıklama yaptı.'),
    })
    expect(res.issues).toContain('CLICKBAIT_TEMPLATE_PHRASE')
  })

  it('does NOT flag legitimate real-news use of "kriz"/"skandal"/"şok" as bare words', () => {
    const res = validateEditorialCandidate({
      title: 'Ekonomik kriz nedeniyle zam geldi',
      body: longEnoughBody(
        'Yolsuzluk skandalı soruşturması derinleşiyor. Depremin şok dalgası çevre illerde de hissedildi.'
      ),
    })
    expect(res.issues).not.toContain('AI_FILLER_LANGUAGE')
    expect(res.issues).not.toContain('CLICKBAIT_TEMPLATE_PHRASE')
  })

  it('does NOT flag ordinary factual sentences with no template phrase', () => {
    const res = validateEditorialCandidate({
      title: 'Bakanlıktan yeni yönetmelik açıklaması',
      body: longEnoughBody('Yönetmelik resmi gazetede yayımlandı ve yürürlüğe girdi.'),
    })
    expect(res.issues).not.toContain('AI_FILLER_LANGUAGE')
    expect(res.issues).not.toContain('CLICKBAIT_TEMPLATE_PHRASE')
  })

  it('flags P1.3 empty-clickbait title templates', () => {
    const res = validateEditorialCandidate({
      title: 'Herkes bunu konuşuyor: Belediye başkanından açıklama',
      body: longEnoughBody('Belediye başkanı konuya ilişkin resmi açıklama yaptı.'),
    })
    expect(res.issues).toContain('CLICKBAIT_TEMPLATE_PHRASE')
  })
})
