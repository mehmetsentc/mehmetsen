import { describe, expect, it } from 'vitest'
import {
  isLiveBlogOrStream,
  isPromoOnlyContent,
  isContentEmpty,
  isSkippableForSocial,
  isStoryEligible,
} from './publishOneSocial'

describe('publishOneSocial filters', () => {
  describe('isLiveBlogOrStream', () => {
    it('does not flag regular news reporting statements from TV/broadcasts or general news', () => {
      // Headlines from user CMS screenshot
      expect(
        isLiveBlogOrStream({
          title: "FETÖ'nün Almanya yapılanmasına İstanbul merkezli operasyon: 2 kişi yakalandı",
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: "İmamoğlu'ndan Gürlek'e Canlı Yayın Yanıtı: 'İlk Gün Ne Dediysek Arkasındayız'",
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: 'Nepal-Tibet sel felaketinin nedeni buzul çökmesi olabilir',
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: "Almanya'da okulda şiddet: 2 kişi öldü, şüpheli gözaltında",
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: "Trump: Putin'le iyi bir görüşme yaptık, Rusya NATO topraklarına saldırmayacak",
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: 'Nepal-Tibet sınırındaki sel felaketinde can kaybı 392’ye yükseldi',
        })
      ).toBe(false)

      // Other common news patterns with "canlı"
      expect(
        isLiveBlogOrStream({
          title: 'Bakan Şimşek canlı yayında enflasyon hedeflerini açıkladı',
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: 'Canlı yayında gergin anlar yaşandı: Stüdyoyu terk etti',
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: 'Canlı yayında fenalaşan konuğa ilk müdahale yapıldı',
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: 'Canlı hayvan ithalatına yeni düzenleme getirildi',
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: 'Canlı bomba eylemi hazırlığındaki şüpheli yakalandı',
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: 'Canlı türleri koruma altına alındı',
        })
      ).toBe(false)

      expect(
        isLiveBlogOrStream({
          title: 'Bakanlığın yayımladığı raporda canlı popülasyonu arttı',
        })
      ).toBe(false)
    })

    it('flags explicit live streams, live tickers, and stream watch pages', () => {
      expect(
        isLiveBlogOrStream({
          isLiveBlog: true,
          title: 'Seçim Özel',
        })
      ).toBe(true)

      expect(
        isLiveBlogOrStream({
          title: '#canlı Seçim Sonuçları Takibi',
        })
      ).toBe(true)

      expect(
        isLiveBlogOrStream({
          title: 'CANLI: Cumhurbaşkanlığı Basın Açıklaması',
        })
      ).toBe(true)

      expect(
        isLiveBlogOrStream({
          title: '[CANLI] Türkiye - Portekiz Maçı',
        })
      ).toBe(true)

      expect(
        isLiveBlogOrStream({
          title: 'Galatasaray - Fenerbahçe Derbisi Canlı İzle',
        })
      ).toBe(true)

      expect(
        isLiveBlogOrStream({
          title: 'Kesintisiz Canlı İzle: Haber Bülteni',
        })
      ).toBe(true)

      expect(
        isLiveBlogOrStream({
          title: 'Deprem bölgesi dakika dakika canlı anlatım',
        })
      ).toBe(true)

      expect(
        isLiveBlogOrStream({
          title: 'CANLI YAYIN: Meclis Genel Kurulu Toplanıyor',
        })
      ).toBe(true)

      expect(
        isLiveBlogOrStream({
          title: 'CANLI BLOG: Seçim Gecesi Gelişmeleri',
        })
      ).toBe(true)
    })
  })

  describe('isPromoOnlyContent', () => {
    it('flags spam / promo-only channel subscription stubs', () => {
      expect(
        isPromoOnlyContent({
          title: 'WhatsApp kanalımıza katılın',
          spot: 'En son gelişmeler için whatsapp.com/channel/abc takip edin.',
        })
      ).toBe(true)

      expect(
        isPromoOnlyContent({
          title: 'Önemli duyuru',
          spot: 'Kanalımıza abone olun t.me/nahaber',
          content: '',
        })
      ).toBe(true)
    })

    it('does not flag real news articles that cite a Telegram or WhatsApp link', () => {
      expect(
        isPromoOnlyContent({
          title: 'Siber dolandırıcılık çetesine operasyon: 12 gözaltı',
          spot: 'Emniyet Genel Müdürlüğü Siber Suçlarla Mücadele Daire Başkanlığı koordinesinde operasyon düzenlendi.',
          content:
            'Şüphelilerin t.me/ üzerinden kurdukları sahte gruplarla vatandaşları mağdur ettiği belirlendi. Çok sayıda dijital materyale el konuldu ve adli süreç başlatıldı.',
        })
      ).toBe(false)
    })
  })

  describe('isContentEmpty', () => {
    it('detects truly empty content', () => {
      expect(
        isContentEmpty({
          title: 'Boş haber',
          spot: '',
          content: '',
        })
      ).toBe(true)
    })

    it('recognizes bodyBlocks as valid content', () => {
      expect(
        isContentEmpty({
          title: 'Blok içerikli haber',
          spot: '',
          content: '',
          bodyBlocks: [
            {
              id: 'b-1',
              type: 'paragraph',
              text: 'Çanakkale Boğazı’nda etkili olan yoğun sis nedeniyle gemi trafiği çift yönlü olarak durduruldu.',
            },
          ],
        })
      ).toBe(false)
    })

    it('recognizes htmlContent and spot as valid content', () => {
      expect(
        isContentEmpty({
          title: 'HTML haber',
          spot: 'Çanakkale’de sis alarmı verildi.',
          htmlContent: '<p>Trafik geçici olarak askıya alındı.</p>',
        })
      ).toBe(false)
    })
  })

  describe('isSkippableForSocial and isStoryEligible', () => {
    it('allows all CMS screenshot news items for story and social sharing', () => {
      const cmsItems = [
        {
          title: "FETÖ'nün Almanya yapılanmasına İstanbul merkezli operasyon: 2 kişi yakalandı",
          spot: 'İstanbul Cumhuriyet Başsavcılığı koordinesinde yürütülen soruşturmada 2 şüpheli gözaltına alındı.',
          content: 'Operasyon kapsamında dijital materyallere ve örgütsel dokümanlara el konuldu.',
          categoryId: 'gundem',
          featured: true,
        },
        {
          title: "İmamoğlu'ndan Gürlek'e Canlı Yayın Yanıtı: 'İlk Gün Ne Dediysek Arkasındayız'",
          spot: 'İstanbul Büyükşehir Belediye Başkanı Ekrem İmamoğlu, Adalet Bakanı Akın Gürlek’in açıklamalarına yanıt verdi.',
          content: 'İmamoğlu, canlı yayında dile getirilen iddialara ilişkin detaylı değerlendirmelerde bulundu.',
          categoryId: 'gundem',
          featured: true,
        },
        {
          title: 'Nepal-Tibet sel felaketinin nedeni buzul çökmesi olabilir',
          spot: 'Yüksek irtifadaki bir buzul parçasının kopması sonucu felaketin yaşandığı belirtildi.',
          content: 'Bilim insanları bölgedeki ısınmanın buzul göllerinde taşmaya yol açtığını kaydetti.',
          categoryId: 'dunya',
          featured: true,
        },
      ]

      for (const item of cmsItems) {
        expect(isSkippableForSocial(item)).toBe(false)
        expect(isStoryEligible(item)).toBe(true)
      }
    })
  })
})
