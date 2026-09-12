import { describe, expect, it } from 'vitest'
import { NEWS_FORMAT_LOCK } from './newsFormatLock'
import { CURRENT_PRODUCTION_NEWS_FORMAT_LOCK } from './currentProductionNewsFormatLock'
import { CLOSED_EVIDENCE_CONTRACT } from './evidenceContract'
import {
  claimAttributionMissing,
  detectCertaintyShifts,
  flagEvidenceMismatches,
  flagLexicalInflations,
} from './evidenceGrounding'
import { composePreviewNewsPrompt } from './previewCompose'
import { SEED_AI_EDITORS } from './seedEditors'
import { buildStage1WriterPrompt } from '@/services/newsroom/editors/stage1_contentWriter'
import { MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'

describe('AI STYLE P1.3A — evidence-bound writing', () => {
  it('keeps High-Engagement DNA while adding closed-evidence contract', () => {
    expect(NEWS_FORMAT_LOCK).toContain('NAHABER HIGH-ENGAGEMENT DNA')
    expect(NEWS_FORMAT_LOCK).toContain('NAHABER SUNUŞ (AI STYLE P1.3')
    expect(NEWS_FORMAT_LOCK).toContain(CLOSED_EVIDENCE_CONTRACT)
    expect(CURRENT_PRODUCTION_NEWS_FORMAT_LOCK).not.toContain('KAPALI KANIT')
  })

  it('does not lower global crawler body minimums', () => {
    expect(MIN_NEWS_BODY_WORDS).toBe(220)
  })

  it('Stage1 JSON contract no longer forces 220-word padding', () => {
    const text = buildStage1WriterPrompt({
      sourceLabel: 'AA',
      originalTitle: 'Test',
      originalSummary: 'Özet',
      originalContent: 'İçerik metni burada yeterince uzun olsun.',
      sourceUrl: 'https://example.test/a',
    }).userContent
    expect(text).toContain('KANIT YOĞUNLUĞU')
    expect(text).not.toContain('ZORUNLU en az 220 kelime')
  })

  it('WORLD: flags historical numbers/dates absent from evidence', () => {
    const source =
      "Bosna Hersek Dışişleri Bakanı Elmedin Konakovic, Srebrenitsa Soykırımı'nın baş sorumlularından Ratko Mladic'in Sırbistan'da devlet ve askeri törenle gömülmesinden sorumlu kişilere yaptırım uygulanması çağrısında bulundu."
    const report = flagEvidenceMismatches({
      source,
      generated: {
        title: "Bosna Hersek'ten Mladic'in cenaze törenine yaptırım çağrısı",
        spot: 'Konakovic yaptırım istedi.',
        content:
          "Mahkeme, 1995 yılında Srebrenitsa'da 8 binden fazla Boşnak erkeğin öldürülmesinden sorumlu tutulan Mladic'e müebbet hapis cezası vermişti. Her yıl 11 Temmuz'da anma yapılır. ICTY karar vermişti.",
      },
    })
    expect(report.unsupportedNumbers).toEqual(expect.arrayContaining(['1995', '8', '11']))
    expect(report.lexicalInflations).toEqual(
      expect.arrayContaining(['srebrenica_year', 'srebrenica_toll', 'july_11', 'icty', 'life_sentence'])
    )
    expect(report.reviewFlags).toContain('UNSUPPORTED_NUMBER')
  })

  it('ECONOMY: flags unsupported project names', () => {
    const source =
      "Enerji ve Tabii Kaynaklar Bakanı Alparslan Bayraktar, Türkiye ve Azerbaycan'ın önünde elektrik alanında çok büyük projeler bulunduğunu belirtti."
    const report = flagEvidenceMismatches({
      source,
      generated: {
        title: 'Bayraktar: elektrik alanında büyük projeler var',
        spot: 'Bakan elektrik başlığını öne çıkardı.',
        content:
          "Bakü-Tiflis-Ceyhan Ham Petrol Boru Hattı, TANAP ve Hazar Denizi'nin batısındaki enerji koridoru üzerinden Avrupa'ya elektrik ihracatı konuşuluyor.",
      },
    })
    expect(report.lexicalInflations).toEqual(
      expect.arrayContaining(['pipeline_tanap', 'pipeline_btc', 'hazar_corridor'])
    )
  })

  it('SPORT: flags unsupported host status', () => {
    const source =
      "FIBA 2026 Kadınlar Basketbol Dünya Kupası'nda finalde ABD ile Fransa karşı karşıya gelecek."
    expect(flagLexicalInflations(source, 'Fransa, Ev Sahibi Avantajını Kullanmak İstiyor')).toContain(
      'host_status'
    )
  })

  it('MAGAZINE: flags invented ceremony / social reaction', () => {
    const source = "'Kızılcık Şerbeti'nin Aylin'i Hamide Akkuş, sevgilisi Tugay Ercins ile yüzük taktı"
    const generated =
      'Nişan töreni, ailelerin ve yakın dostların katılımıyla gerçekleşti. Nişan haberi, sosyal medyada takipçiler tarafından paylaşıldı.'
    expect(flagLexicalInflations(source, generated)).toEqual(
      expect.arrayContaining(['ceremony_family', 'social_media_reaction'])
    )
  })

  it('TECH: flags external legislation/company context unless supplied', () => {
    const source =
      "Anthropic CEO’su Dario Amodei, yapay zeka modellerinin geliştirilme hızının yavaşlatılması gerektiğini savundu. Elon Musk, CEO'nun açıklamalarına destek verdi."
    const generated =
      "Amodei'nin açıklamalarına Tesla ve SpaceX CEO'su Elon Musk'tan destek geldi. Avrupa Birliği, Yapay Zeka Yasası ile kapsamlı kurallar getirmeyi planlarken, ABD'de de çeşitli yasa teklifleri gündemde."
    expect(flagLexicalInflations(source, generated)).toEqual(
      expect.arrayContaining(['tesla_spacex', 'eu_ai_act', 'us_bills'])
    )
  })

  it('LOCAL: project/plan must not become completed implementation', () => {
    const source =
      'Mesleki Eğitimde Yeni Dönem: AR Teknolojileri Araç Eğitimine Entegre Ediliyor. Erasmus+ kapsamında yürütülen proje için İl Millî Eğitim Müdürü ziyaret edildi.'
    const title = 'AR Teknolojisi Mesleki Eğitimde Araç Derslerine Girdi'
    expect(detectCertaintyShifts(source, title)).toContain('plan_to_implemented')
    expect(flagLexicalInflations(source, title)).toContain('implemented_classes')
  })

  it('BREAKING: claim attribution must survive headline + lead', () => {
    const source =
      "Yemen'deki İran destekli Husiler, Suudi Arabistan'ın Şarure şehrinde bulunan bir askeri üsse balistik füze ve insansız hava araçlarıyla (İHA) saldırı düzenlediklerini öne sürdü."
    expect(
      claimAttributionMissing(
        source,
        'Husiler Suudi Arabistan’da askeri üsse saldırı düzenledi',
        'Askeri üs vuruldu.',
        'Husiler saldırı düzenledi.'
      )
    ).toBe(true)
    expect(
      claimAttributionMissing(
        source,
        'Husiler, Suudi Arabistan’daki askeri üsse füze ve İHA saldırısı düzenlediklerini öne sürdü',
        'Husiler saldırı düzenlediklerini iddia etti.',
        'Husiler öne sürdü.'
      )
    ).toBe(false)
    expect(
      claimAttributionMissing(
        source,
        'Husiler: Suudi Arabistan’da askeri üsse balistik füze ve İHA saldırısı düzenledik',
        'Husiler öne sürdü. Suudi yetkililerden açıklama yok.',
        'Husiler öne sürdü.'
      )
    ).toBe(false)
  })

  it('warrant must not become an executed detention in the headline', () => {
    expect(
      detectCertaintyShifts(
        '11 şüpheli hakkında gözaltı kararı verildi.',
        '11 şüpheli gözaltına alındı'
      )
    ).toContain('warrant_to_arrested')
  })

  it('preview NEW arm still carries persona + P1.3 DNA + P1.3A contract', () => {
    const spec = SEED_AI_EDITORS.find((s) => s.slug === 'arda-sahin')!
    const neu = composePreviewNewsPrompt({
      spec,
      arm: 'new',
      sourceTitle: 'Test',
      sourceBody: 'Kanıt gövdesi',
      sourceUrl: 'https://example.com/a',
    })
    expect(neu.system).toContain('Arda Şahin')
    expect(neu.system).toContain('NAHABER HIGH-ENGAGEMENT DNA')
    expect(neu.system).toContain('KAPALI KANIT SÖZLEŞMESİ')
  })
})
