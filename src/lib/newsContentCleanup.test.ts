import { describe, expect, it } from 'vitest'
import { splitSentences, cleanupNewsBody } from './newsContentCleanup'
import { splitNewsParagraphs } from './newsContent'

describe('Article Body Paragraph & Sentence Integrity (Phase P17.8C.4)', () => {
  it('preserves time expressions with period like 16.00 intact without sentence or paragraph split', () => {
    const text = 'Uzunalan köyünde ahır kısmında saat 16.00 sıralarında yangın çıktı.'
    const sentences = splitSentences(text)
    expect(sentences).toHaveLength(1)
    expect(sentences[0]).toBe('Uzunalan köyünde ahır kısmında saat 16.00 sıralarında yangın çıktı.')

    const paragraphs = splitNewsParagraphs(text)
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0]).toContain('16.00 sıralarında yangın çıktı.')
    expect(paragraphs[0]).not.toContain('16.\n\n00')
  })

  it('preserves decimal numbers and percentages (09.30, 34.7, 3.14, 1.000)', () => {
    const text = 'Toplantı 09.30\'da başladı. Oran yüzde 34.7 olarak açıklandı. Pi sayısı 3.14 ve hedef 1.000 adet.'
    const sentences = splitSentences(text)
    expect(sentences).toHaveLength(3)
    expect(sentences[0]).toBe('Toplantı 09.30\'da başladı.')
    expect(sentences[1]).toBe('Oran yüzde 34.7 olarak açıklandı.')
    expect(sentences[2]).toBe('Pi sayısı 3.14 ve hedef 1.000 adet.')
  })

  it('preserves abbreviations like Prof. Dr., Doç., Av., A.Ş., T.C. without false splits', () => {
    const text = 'Prof. Dr. Ahmet Yılmaz ve Doç. Dr. Mehmet Kaya açıklamada bulundu. Şirket A.Ş. tarafından T.C. kanunlarına uygun hareket edildi.'
    const sentences = splitSentences(text)
    expect(sentences).toHaveLength(2)
    expect(sentences[0]).toBe('Prof. Dr. Ahmet Yılmaz ve Doç. Dr. Mehmet Kaya açıklamada bulundu.')
    expect(sentences[1]).toBe('Şirket A.Ş. tarafından T.C. kanunlarına uygun hareket edildi.')
  })

  it('preserves domain names like example.com and www.example.com intact', () => {
    const text = 'Detaylar example.com adresinde yayınlandı. Ayrıca www.nahaber.com sitesinden takip edebilirsiniz.'
    const sentences = splitSentences(text)
    expect(sentences).toHaveLength(2)
    expect(sentences[0]).toBe('Detaylar example.com adresinde yayınlandı.')
    expect(sentences[1]).toBe('Ayrıca www.nahaber.com sitesinden takip edebilirsiniz.')
  })

  it('splits genuine distinct sentences correctly', () => {
    const text = 'Yangın kontrol altına alındı. Ekipler soğutma çalışması başlattı! Can kaybı yaşanmadı mı? Hasar tespit ediliyor…'
    const sentences = splitSentences(text)
    expect(sentences).toHaveLength(4)
    expect(sentences[0]).toBe('Yangın kontrol altına alındı.')
    expect(sentences[1]).toBe('Ekipler soğutma çalışması başlattı!')
    expect(sentences[2]).toBe('Can kaybı yaşanmadı mı?')
    expect(sentences[3]).toBe('Hasar tespit ediliyor…')
  })

  it('preserves existing multi-paragraph structure in news body', () => {
    const text = 'İlk paragraf saat 16.00 sıralarında başladı.\n\nİkinci paragraf Dr. Ali Bey ile devam etti.'
    const paragraphs = splitNewsParagraphs(text)
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[0]).toBe('İlk paragraf saat 16.00 sıralarında başladı.')
    expect(paragraphs[1]).toBe('İkinci paragraf Dr. Ali Bey ile devam etti.')
  })

  it('accurately parses the pilot article body without splitting 16.00', () => {
    const pilotBody = "Çanakkale’nin Çan ilçesine bağlı Uzunalan köyünde bir büyükbaş hayvan işletmesinin ahır kısmında saat 16.00 sıralarında yangın çıktı. Alevlerin yükseldiğini gören çevredekilerin ihbarı üzerine bölgeye itfaiye, orman arazözleri ve jandarma ekipleri intikal etti. İtfaiye ekipleri ulaşana kadar köy muhtarlığına ait su tankeriyle ilk müdahaleyi yapan köylüler, alevlerin çevredeki yerleşim yerlerine sıçramasını engelledi. İtfaiye ve orman ekiplerinin koordineli çalışmasıyla kontrol altına alınan yangında ahırın çatısı hasar görürken, içerideki büyükbaş hayvanlar tahliye edilerek kurtarıldı. Yangının çıkış nedenine ilişkin jandarma tarafından tahkikat başlatıldı."
    
    const paragraphs = splitNewsParagraphs(pilotBody)
    expect(paragraphs.length).toBeGreaterThan(0)
    for (const p of paragraphs) {
      if (p.includes('16.')) {
        expect(p).toContain('16.00 sıralarında yangın çıktı.')
      }
    }
  })
})
