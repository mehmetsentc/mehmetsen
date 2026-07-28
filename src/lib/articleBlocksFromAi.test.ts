import { describe, expect, it } from 'vitest'
import { buildBodyBlocksFromAi } from '@/lib/articleBlocksFromAi'
import { sanitizeArticleBlocks, textToArticleBlocks } from '@/lib/articleBlocks'

describe('sanitizeArticleBlocks', () => {
  it('coerces body H1 headings to H2', () => {
    const blocks = sanitizeArticleBlocks([
      { id: 'h1', type: 'heading', level: 1, text: 'Sayfa içi H1' },
      { id: 'h3', type: 'heading', level: 3, text: 'Alt başlık' },
    ])
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 2, text: 'Sayfa içi H1' })
    expect(blocks[1]).toMatchObject({ type: 'heading', level: 3 })
  })

  it('splits oversized headings into short title + paragraph', () => {
    const blocks = sanitizeArticleBlocks([
      {
        id: 'long',
        type: 'heading',
        level: 3,
        text: 'Dev Panda Araştırmanın ilk sırasında dev panda yer aldı katılımcılar seçti',
      },
    ])
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 3 })
    expect(blocks[0].type === 'heading' && blocks[0].text.split(' ').length).toBeLessThanOrEqual(8)
    expect(blocks.some((block) => block.type === 'paragraph')).toBe(true)
  })

  it('preserves image credit and caption', () => {
    const blocks = sanitizeArticleBlocks([
      {
        id: 'img',
        type: 'image',
        url: 'https://cdn.example.com/photo.jpg',
        caption: 'Açıklama',
        credit: 'AA',
      },
    ])
    expect(blocks[0]).toMatchObject({
      type: 'image',
      caption: 'Açıklama',
      credit: 'AA',
    })
  })
})

describe('textToArticleBlocks', () => {
  it('keeps heading and following paragraph separate with single newline', () => {
    const blocks = textToArticleBlocks(
      '### Dev Panda\nAraştırmanın ilk sırasında dev panda yer aldı ve katılımcılar bunu seçti.'
    )
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 3, text: 'Dev Panda' })
    expect(blocks[1]).toMatchObject({
      type: 'paragraph',
      text: expect.stringContaining('Araştırmanın ilk sırasında'),
    })
  })

  it('demotes a long sentence wrongly marked as heading to one paragraph', () => {
    const blocks = textToArticleBlocks(
      '### Kastamonu ve Rize\'de yerel sağanak beklenirken, yurdun büyük bölümünde sıcak hava etkili olacak.'
    )
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'paragraph' })
    expect(blocks[0].type === 'paragraph' && blocks[0].text).toContain('etkili olacak')
  })
})

describe('buildBodyBlocksFromAi', () => {
  it('never emits body H1; cover and spot stay outside bodyBlocks by default', () => {
    const blocks = buildBodyBlocksFromAi({
      title: 'Deprem sonrası yardım çalışması',
      spot: 'Ekipler bölgede arama kurtarma sürdürüyor.',
      content:
        '## Sahada çalışmalar\n\n' +
        'İlk paragraf yeterince uzun olmalı ki bloğa dönüşsün ve haberin bağlamı anlaşılsın burada.\n\n' +
        '## Yardım sevkiyatı\n\n' +
        'İkinci paragraf da uzun tutulmalı çünkü bölüm başlıkları buna göre üretilir ve okunur burada.',
      imageUrl: 'https://cdn.example.com/cover.jpg',
      imageCaption: 'Sahadan görüntü',
    })

    const headings = blocks.filter((b) => b.type === 'heading')
    expect(headings.every((h) => h.type === 'heading' && h.level !== 1)).toBe(true)
    expect(blocks.some((b) => b.type === 'image')).toBe(false)
    expect(
      blocks.some((b) => b.type === 'paragraph' && b.text === 'Ekipler bölgede arama kurtarma sürdürüyor.')
    ).toBe(false)
    expect(headings.some((h) => h.type === 'heading' && h.text === 'Sahada çalışmalar')).toBe(true)
  })

  it('can embed spot and cover when externalLeadAndCover is false', () => {
    const blocks = buildBodyBlocksFromAi({
      title: 'Deprem sonrası yardım çalışması',
      spot: 'Ekipler bölgede arama kurtarma sürdürüyor.',
      content:
        'İlk paragraf yeterince uzun olmalı ki bloğa dönüşsün ve haberin bağlamı anlaşılsın.\n\n' +
        'İkinci paragraf da uzun tutulmalı çünkü bölüm başlıkları buna göre üretilir ve okunur.\n\n' +
        'Üçüncü paragraf ek detay verir ve yapılandırılmış gövde testini tamamlar buraya kadar.\n\n' +
        'Dördüncü paragraf son bölüm için yeterli uzunlukta bir metin parçasıdır burada.',
      imageUrl: 'https://cdn.example.com/cover.jpg',
      imageCaption: 'Sahadan görüntü',
      externalLeadAndCover: false,
    })

    const imageIdx = blocks.findIndex((b) => b.type === 'image')
    expect(imageIdx).toBeGreaterThanOrEqual(0)
    // Caption stays on the image — no auto H2 from caption
    expect(blocks[imageIdx + 1]?.type).not.toBe('heading')
  })

  it('uses explicit imageSectionHeading under cover when provided', () => {
    const blocks = buildBodyBlocksFromAi({
      title: 'Deprem sonrası yardım çalışması',
      content:
        'İlk paragraf yeterince uzun olmalı ki bloğa dönüşsün ve haberin bağlamı anlaşılsın burada.\n\n' +
        'İkinci paragraf da uzun tutulmalı çünkü bölüm başlıkları buna göre üretilir ve okunur.',
      imageUrl: 'https://cdn.example.com/cover.jpg',
      imageCaption:
        "Güney Kore'deki bir sağlık merkezinde akıllı cihazlar ve dijital ekranlar eşliğinde gerçekleştirilen check-up süreci.",
      imageSectionHeading: 'Sağlık turizmi',
      externalLeadAndCover: false,
    })
    const imageIdx = blocks.findIndex((b) => b.type === 'image')
    expect(blocks[imageIdx + 1]).toMatchObject({ type: 'heading', level: 2, text: 'Sağlık turizmi' })
    expect(
      blocks.every(
        (b) => !(b.type === 'heading' && b.text.includes('akıllı cihazlar'))
      )
    ).toBe(true)
  })

  it('does not invent H3 from long image captions (no mid-word slice)', () => {
    const longCaption =
      "Güney Kore'deki bir sağlık merkezinde görevli personel, check-up programına katılan yabancı hastaları bilgilendiriyor."
    const blocks = buildBodyBlocksFromAi({
      title: 'Ana haber',
      content: 'Tek paragraf yeterince uzun bir gövde metni olarak burada yer alır ve okunur.',
      imageUrl: 'https://cdn.example.com/a.jpg',
      additionalImages: [{ url: 'https://cdn.example.com/b.jpg', caption: longCaption }],
    })
    const images = blocks.filter((b) => b.type === 'image')
    expect(images).toHaveLength(1)
    expect(images[0]?.url).toContain('b.jpg')
    expect(images[0]).toMatchObject({ caption: longCaption })
    const secondImgIdx = blocks.findIndex(
      (b) => b.type === 'image' && b.url.includes('b.jpg')
    )
    expect(blocks[secondImgIdx + 1]?.type).not.toBe('heading')
    expect(
      blocks.every(
        (b) => !(b.type === 'heading' && (b.text.includes('yabancı') || b.text.includes('gerçek')))
      )
    ).toBe(true)
  })

  it('does not invent H2/H3 from plain paragraph first words', () => {
    const blocks = buildBodyBlocksFromAi({
      title: 'Liste',
      content:
        'Birinci hayvan hakkındaki yeterince uzun paragraf burada yer alır ve okunur.\n\n' +
        'İkinci hayvan hakkındaki yeterince uzun paragraf burada yer alır ve okunur.\n\n' +
        'Üçüncü hayvan hakkındaki yeterince uzun paragraf burada yer alır ve okunur.\n\n' +
        'Dördüncü hayvan hakkındaki yeterince uzun paragraf burada yer alır ve okunur.',
    })
    const bodyHeadings = blocks.filter((b) => b.type === 'heading')
    expect(bodyHeadings).toHaveLength(0)
    expect(blocks.filter((b) => b.type === 'paragraph')).toHaveLength(4)
  })

  it('converts markdown # headings to H2 and keeps ## / ###', () => {
    const blocks = buildBodyBlocksFromAi({
      title: 'Başlık',
      content: '# Yanlış H1\n\nGiriş paragrafı burada yer alır ve yeterince uzundur.\n\n## Bölüm\n\n### Alt\n\nDetay paragrafı buraya yazılır ve uzun tutulur.',
    })
    const headings = blocks.filter((b) => b.type === 'heading')
    expect(headings.some((h) => h.type === 'heading' && h.level === 1)).toBe(false)
    expect(headings.some((h) => h.type === 'heading' && h.level === 2 && h.text.includes('Yanlış'))).toBe(true)
    expect(headings.some((h) => h.type === 'heading' && h.level === 2 && h.text === 'Bölüm')).toBe(true)
    expect(headings.some((h) => h.type === 'heading' && h.level === 3 && h.text === 'Alt')).toBe(true)
  })

  it('repairs glued heading+paragraph markdown like the CMS bug', () => {
    const blocks = buildBodyBlocksFromAi({
      title: 'Hayvanlar',
      content:
        '### Dev Panda\nAraştırmanın ilk sırasında dev panda yer aldı. Katılımcıların yüzde 41\'i pandaları seçti.\n\n' +
        '### Fil\nListenin ikinci sırasında yer alan filler yeni sıralamaya girdi.',
    })
    expect(blocks.some((b) => b.type === 'heading' && b.level === 3 && b.text === 'Dev Panda')).toBe(true)
    expect(blocks.some((b) => b.type === 'heading' && b.level === 3 && b.text === 'Fil')).toBe(true)
    expect(
      blocks.some(
        (b) => b.type === 'paragraph' && b.text.includes('Araştırmanın ilk sırasında')
      )
    ).toBe(true)
    expect(
      blocks.every(
        (b) => !(b.type === 'heading' && b.text.includes('Araştırmanın'))
      )
    ).toBe(true)
  })

  it('dedupes spot-like paragraphs and demotes sentence-like fake headings', () => {
    const spot =
      'Meteoroloji Genel Müdürlüğü, yurdun büyük bölümünde sıcak ve açık havanın etkisini sürdüreceğini açıkladı.'
    const blocks = buildBodyBlocksFromAi({
      title: 'İki ilde sağanak bekleniyor, yurt genelinde sıcak hava sürüyor',
      spot,
      content:
        `${spot}\n\n` +
        '### Kastamonu ve Rize\'de yerel sağanak beklenirken, yurdun büyük bölümünde sıcak hava etkili olacak.\n\n' +
        '## Sıcak hava yurt genelinde etkili\n\n' +
        'Meteoroloji Genel Müdürlüğü\'nün son değerlendirmelerine göre, yurt genelinde hava sıcaklıklarında önemli bir değişiklik beklenmiyor.\n\n' +
        '## Rüzgar kuzey yönlerden esecek\n\n' +
        'Rüzgârın yurt genelinde ağırlıklı olarak kuzey yönlerden eseceği tahmin ediliyor.\n\n' +
        '## Kastamonu ve Rize\'de sağanak uyarısı\n\n' +
        'Kastamonu ile Rize\'nin iç kesimlerinde yerel sağanak bekleniyor.',
    })

    expect(blocks.some((b) => b.type === 'paragraph' && b.text.includes(spot.slice(0, 40)))).toBe(false)
    expect(
      blocks.some(
        (b) =>
          b.type === 'heading' &&
          b.text.includes('Kastamonu ve Rize') &&
          b.text.includes('sağanak beklenirken')
      )
    ).toBe(false)
    expect(
      blocks.some(
        (b) =>
          b.type === 'paragraph' &&
          b.text.includes('Kastamonu ve Rize') &&
          b.text.includes('sağanak beklenirken')
      )
    ).toBe(true)
    expect(
      blocks.some((b) => b.type === 'heading' && b.text === 'Sıcak hava yurt genelinde etkili')
    ).toBe(true)
  })

  it('places an additional image after the requested paragraph', () => {
    const blocks = buildBodyBlocksFromAi({
      title: 'Yerleşim testi',
      content:
        'Birinci paragraf görselden önce bulunması gereken yeterince uzun haber metnidir.\n\n' +
        'İkinci paragraf haberin devamını anlatan yeterince uzun bir metin parçasıdır.\n\n' +
        'Üçüncü paragraf haberin son ayrıntılarını veren yeterince uzun bir metindir.',
      additionalImages: [{
        url: 'https://cdn.example.com/placed.jpg',
        caption: 'Olay yerinden ayrıntı',
        insertAfterParagraph: 1,
      }],
    })
    const firstParagraph = blocks.findIndex((block) => block.type === 'paragraph')
    expect(blocks[firstParagraph + 1]).toMatchObject({
      type: 'image',
      url: 'https://cdn.example.com/placed.jpg',
    })
  })

  it('produces the same H2/H3 structure for any category or subcategory content', () => {
    const md =
      '## Maç özeti\n\n' +
      'Takımlar ilk yarıda dengeli bir mücadele ortaya koydu ve seyirci tribünlerde yoğun ilgi gösterdi.\n\n' +
      '### Kritik gol\n\n' +
      'İkinci yarıdaki hızlı atak sonucunda skoru değiştiren gol geldi ve maçın dengesi bozuldu.'
    const sport = buildBodyBlocksFromAi({ title: 'Derbi özeti', content: md })
    const tech = buildBodyBlocksFromAi({ title: 'Yeni telefon çıktı', content: md })
    const cinema = buildBodyBlocksFromAi({ title: 'Film vizyonda', content: md })
    for (const blocks of [sport, tech, cinema]) {
      expect(blocks.filter((b) => b.type === 'heading').map((b) => b.type === 'heading' && b.level)).toEqual([
        2, 3,
      ])
      expect(blocks.some((b) => b.type === 'heading' && b.level === 1)).toBe(false)
    }
  })
})
