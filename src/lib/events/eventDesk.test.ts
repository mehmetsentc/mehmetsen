import { describe, expect, it } from 'vitest'
import type { NaEvent } from '@/types/event'
import {
  buildDesk,
  eventSourceText,
  eventVoiceScript,
  parseDeskRecord,
  parseEventNews,
  startOfTodayIstanbul,
  timeLocative,
  trDateParts,
  type DeskRecord,
} from './eventDesk'

const NOW = Date.parse('2026-11-24T21:10:00Z') // 25 Kasım 00:10 (TR)

const ev = (over: Partial<NaEvent>): NaEvent => ({
  id: 'x',
  title: 'Etkinlik',
  description: '',
  category: 'concert',
  city: 'Çanakkale',
  citySlug: 'canakkale',
  venue: 'The Keep',
  startsAt: '2026-12-11T18:30:00.000Z',
  createdAt: '',
  status: 'published',
  source: 'ticketmaster',
  provider: 'Ticketmaster',
  ...over,
})

describe('eventDesk', () => {
  it('bugünün başı İstanbul saatine göre', () => {
    expect(new Date(startOfTodayIstanbul(NOW)).toISOString()).toBe('2026-11-24T21:00:00.000Z')
  })

  it('geçmiş, iptal ve taslak çıkar; bugün başlayanlar kalır; tarihe göre sıralı', () => {
    const { items } = buildDesk(
      [
        ev({ id: 'gecmis', startsAt: '2026-11-20T18:00:00Z' }),
        ev({ id: 'iptal', status: 'cancelled' }),
        ev({ id: 'taslak', status: 'draft' }),
        ev({ id: 'b', title: 'B', startsAt: '2026-12-11T18:30:00Z' }),
        ev({ id: 'a', title: 'A', startsAt: '2026-11-24T21:30:00Z' }),
      ],
      new Map(),
      NOW
    )
    expect(items.map((i) => i.id)).toEqual(['a', 'b'])
  })

  it('2 yıldan sonraki tarih şüpheli listesine gider', () => {
    const { items, suspects } = buildDesk([ev({ id: 's', title: 'Kutu Oyunları Gecesi', startsAt: '2036-05-02T17:00:00Z', provider: 'Biletix' })], new Map(), NOW)
    expect(items).toHaveLength(0)
    expect(suspects[0]).toMatchObject({ id: 's', source: 'Biletix' })
  })

  it('düzeltilen tarih ve gizleme masa kaydından uygulanır', () => {
    const desks = new Map<string, DeskRecord>([
      ['s', parseDeskRecord('s', { startsAtOverride: '2026-05-02T17:00:00Z' })],
      ['h', parseDeskRecord('h', { hidden: true })],
    ])
    const { items, suspects } = buildDesk(
      [ev({ id: 's', startsAt: '2036-05-02T17:00:00Z' }), ev({ id: 'h' }), ev({ id: 't', title: 'Başka', startsAt: '2027-05-02T17:00:00Z' })],
      new Map([...desks, ['s', parseDeskRecord('s', { startsAtOverride: '2027-05-02T17:00:00Z' })]]),
      NOW
    )
    expect(suspects).toHaveLength(0)
    expect(items.map((i) => i.id).sort()).toEqual(['s', 't'])
  })

  it('aynı gün, saat ve mekân farklı kaynaklardan → tek satır; mekân farklıysa ayrı ama «olası tekrar»', () => {
    const base = { citySlug: 'antalya', city: 'Antalya', startsAt: '2026-11-25T18:00:00Z' }
    const { items } = buildDesk(
      [
        ev({ id: 'tm', title: 'Uzi', venue: 'Antalya Açıkhava', ...base }),
        ev({ id: 'bx', title: 'UZI', venue: 'ANTALYA AÇIKHAVA', ...base, provider: 'Biletix', coverImageUrl: 'https://x/c.jpg' }),
        ev({ id: 'bb', title: 'Uzi', venue: 'Konyaaltı Nazım Hikmet KM', ...base, provider: 'Bubilet' }),
      ],
      new Map(),
      NOW
    )
    expect(items).toHaveLength(2)
    const merged = items.find((i) => i.ids.length === 2)!
    expect(merged.sources).toEqual(['Ticketmaster', 'Biletix'])
    expect(merged.hasImage).toBe(true)
    expect(items.every((i) => i.possibleDuplicate)).toBe(true)
  })

  it('aynı gün farklı saatteki iki gösteri ayrı kalır', () => {
    const { items } = buildDesk([ev({ id: 'g1', title: 'Stand-up', startsAt: '2026-12-05T15:00:00Z' }), ev({ id: 'g2', title: 'Stand-up', startsAt: '2026-12-05T18:00:00Z', venue: 'Başka Sahne' })], new Map(), NOW)
    expect(items).toHaveLength(2)
  })

  it('art arda günlük kayıtlar «her gün» tek satır', () => {
    const days = ['25', '26', '27', '28'].map((d, i) => ev({ id: `k${i}`, title: 'Antalya Kum Heykel Müzesi - 2026', category: 'exhibition', venue: 'Antalya Kum Heykel Müzesi', citySlug: 'antalya', city: 'Antalya', startsAt: `2026-11-${d}T06:00:00Z` }))
    const { items } = buildDesk(days, new Map(), NOW)
    expect(items).toHaveLength(1)
    expect(items[0]!.daily).toMatchObject({ days: 4 })
    expect(items[0]!.ids).toHaveLength(4)
  })

  it('görsel ve eksik bilgi: masaya eklenen kapak görselsizliği giderir', () => {
    const desks = new Map([['n', parseDeskRecord('n', { coverUrl: 'https://x/k.jpg', info: { price: '500 TL' } })]])
    const { items } = buildDesk([ev({ id: 'n', source: 'firestore', provider: undefined }), ev({ id: 'm', title: 'M' })], desks, NOW)
    const n = items.find((i) => i.id === 'n')!
    const m = items.find((i) => i.id === 'm')!
    expect(n.hasImage).toBe(true)
    expect(n.sources).toEqual(['NaHaber'])
    expect(m.hasImage).toBe(false)
    expect(m.completeness.missing).toContain('Görsel')
    expect(n.completeness.percent).toBeGreaterThan(m.completeness.percent)
  })

  it('masa kaydı geçersiz medya ve http bağlantısını atar', () => {
    const r = parseDeskRecord('e', {
      coverUrl: 'http://guvensiz/a.jpg',
      media: [
        { id: 'm1abc', kind: 'image', url: 'https://x/a.jpg', source: 'upload', rights: 'press' },
        { id: 'm2abc', kind: 'video', source: 'library', libraryId: 'vid_1234' },
        { id: 'm3abc', kind: 'video', source: 'library' },
        { id: 'm4abc', kind: 'image', url: 'javascript:alert(1)' },
      ],
    })
    expect(r.coverUrl).toBeNull()
    expect(r.media.map((m) => m.id)).toEqual(['m1abc', 'm2abc'])
    expect(r.media[1]!.rights).toBe('unknown')
  })

  it('Türkçe tarih ve saat ekleri', () => {
    expect(trDateParts('2026-12-11T18:30:00Z', NOW)).toMatchObject({ date: '11 Aralık Cuma', time: '21.30', day: '11', mon: 'ARA' })
    expect(trDateParts('2027-07-01T07:00:00Z', NOW).date).toBe('1 Temmuz 2027 Perşembe')
    expect(['21.30', '21.45', '21.00', '10.00', '20.00', '13.00', '19.40'].map(timeLocative)).toEqual(["21.30'da", "21.45'te", "21.00'de", "10.00'da", "20.00'de", "13.00'te", "19.40'ta"])
  })

  it('seslendirme metni yalnızca alanlardan, 200 karakteri geçmez', () => {
    const { items } = buildDesk([ev({ id: 'c', title: 'Cihan Mürtezaoğlu' })], new Map(), NOW)
    const s = eventVoiceScript(items[0]!, NOW)
    expect(s).toBe("NaHaber Çanakkale etkinlik rehberi. Cihan Mürtezaoğlu, 11 Aralık Cuma, saat 21.30'da, The Keep. Biletler Ticketmaster üzerinden satışta.")
    expect(s.length).toBeLessThanOrEqual(200)
  })

  it('kaynak metin editör notunu ve eksik bilgileri içerir', () => {
    const desks = new Map([['c', parseDeskRecord('c', { info: { price: '750 TL', note: 'Yeni albüm turnesi.' } })]])
    const { items } = buildDesk([ev({ id: 'c', title: 'Cihan Mürtezaoğlu' })], desks, NOW)
    const t = eventSourceText(items[0]!, NOW)
    expect(t).toContain('Bilet fiyatı: 750 TL')
    expect(t).toContain('Editör notu: Yeni albüm turnesi.')
    expect(t).toContain('Bilet satışı: Ticketmaster')
  })

  it('AI cevabını ayrıştırır, HTML temizler, kısa cevabı reddeder', () => {
    const ok = parseEventNews('```json\n{"title":"Cihan Mürtezaoğlu 11 Aralık\'ta Çanakkale\'de","spot":"S","content":"## Etkinlik Bilgileri\\n<b>Yer</b>: The Keep. Konser 21.30\'da başlayacak ve biletler Ticketmaster üzerinden satışta.","tags":["Çanakkale"]}\n```')
    expect(ok?.content).not.toContain('<b>')
    expect(ok?.tags).toEqual(['çanakkale'])
    expect(ok?.summary).toBe('S')
    expect(parseEventNews('{"title":"kısa","content":"x"}')).toBeNull()
    expect(parseEventNews('bozuk')).toBeNull()
  })
})
