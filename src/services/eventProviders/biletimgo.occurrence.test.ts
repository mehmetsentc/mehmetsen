import { describe, expect, it } from 'vitest'
import { getProvincePlate } from '@/constants/provincePlates'
import {
  collectBiletimgoListingCards,
  mapBiletimgoOccurrence,
  parseBiletimgoDetail,
  parseBiletimgoEventHref,
} from './biletimgo'

const LISTING = `
  <div class="swiper-slide" style="background: url('images/kien-ankara-konseri-J7SPF0.jpeg');">
    <span class="swiper-tarih-gun">30</span>
    <span class="swiper-tarih-ay">Ağustos</span>
    <span class="swiper-tarih-yil">2026</span>
    <span class="swiper-etkinlik-kutu">Kien Ankara Konseri<span class="swiper-etkinlik-platform">IF Performance Hall</span></span>
    <a class="swiper-incele" href="etkinlik/kien-ankara-konseri-29270?ref=1">İncele</a>
  </div>
`

const DETAIL = `
  <script type="application/ld+json">
  {"@context":"https://schema.org","@type":"Event","name":"Kien Ankara Konseri","startDate":"2026-08-30T20:00:00+03:00","endDate":"2026-08-31T00:00:00+03:00","image":["https://www.biletimgo.com/images/kien-ankara-konseri-J7SPF0.jpeg"],"location":{"@type":"Place","name":"IF Performance Hall Ankara","address":{"streetAddress":"Kavaklıdere Mahallesi Tunus Caddesi No: 14/A - Çankaya / Ankara","addressLocality":"Ankara"}}}
  </script>
  <meta property="og:title" content="Kien Ankara Konseri – Biletler ve Detaylar">
  <meta property="og:image" content="https://www.biletimgo.com/images/kien-ankara-konseri-J7SPF0.jpeg">
  <div class="etkilikbilgibaslik">Başlangıç Ağustos 30, 2026 20:00</div>
`

describe('BiletimGO adapter', () => {
  it('maps official plates onto existing province slugs', () => {
    expect(getProvincePlate('istanbul')).toBe('34')
    expect(getProvincePlate('ankara')).toBe('06')
    expect(getProvincePlate('izmir')).toBe('35')
    expect(getProvincePlate('antalya')).toBe('07')
    expect(getProvincePlate('canakkale')).toBe('17')
  })

  it('parses numeric event ids from listing cards', () => {
    expect(parseBiletimgoEventHref('etkinlik/kien-ankara-konseri-29270?ref=1')).toEqual({
      slug: 'kien-ankara-konseri',
      numericId: '29270',
    })
    const cards = collectBiletimgoListingCards(LISTING)
    expect(cards).toHaveLength(1)
    expect(cards[0].numericId).toBe('29270')
    expect(cards[0].href).toContain('/etkinlik/kien-ankara-konseri-29270')
  })

  it('derives district when address is deterministic and null otherwise', () => {
    const parsed = parseBiletimgoDetail(DETAIL, 'https://www.biletimgo.com/etkinlik/kien-ankara-konseri-29270')
    expect(parsed.startsAt).toBeTruthy()
    expect(parsed.imageUrl).toContain('/images/kien-ankara-konseri-')
    expect(parsed.address).toContain('Çankaya / Ankara')
    const mapped = mapBiletimgoOccurrence({
      numericId: '29270',
      pageUrl: 'https://www.biletimgo.com/etkinlik/kien-ankara-konseri-29270',
      title: parsed.title,
      address: parsed.address,
      city: parsed.city,
      citySlug: 'ankara',
      imageUrl: parsed.imageUrl,
      startsAt: parsed.startsAt!,
      venue: parsed.venue,
    })
    expect(mapped?.externalId).toBe('29270')
    expect(mapped?.districtSlug).toBe('cankaya')
    expect(mapped?.ticketUrl).toBe('https://www.biletimgo.com/etkinlik/kien-ankara-konseri-29270')

    const unknown = mapBiletimgoOccurrence({
      numericId: '1',
      pageUrl: 'https://www.biletimgo.com/etkinlik/foo-1',
      title: 'Foo',
      startsAt: '2026-09-21T18:00:00.000Z',
      citySlug: 'batman',
    })
    expect(unknown?.districtSlug).toBeUndefined()
  })

  it('does not invent multi-session expansion without evidence', () => {
    const parsed = parseBiletimgoDetail(DETAIL, 'https://www.biletimgo.com/etkinlik/kien-ankara-konseri-29270')
    expect(parsed.startsAt).toBeTruthy()
    expect(DETAIL.match(/subEvent/)).toBeNull()
  })
})
