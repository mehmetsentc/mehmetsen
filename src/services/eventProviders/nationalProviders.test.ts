import { describe, expect, it } from 'vitest'
import { biletinialCategory, biletinialEvents, parseCities } from './biletinial'
import { bugeceEvent, parseBugecePlain } from './bugece'
import { parseEtkinlikIoPage, parseSitemap, pickNew } from './etkinlikio'
import { provinceFromText, provinceSlug } from './provinces'

const NOW = Date.parse('2026-11-27T12:00:00+03:00')

describe('il eşleme', () => {
  it('kaynak adlarını 81 il slug’ına çevirir', () => {
    expect(provinceSlug('Afyon')).toBe('afyonkarahisar')
    expect(provinceSlug('k-maras')).toBe('kahramanmaras')
    expect(provinceSlug('İstanbul Avrupa')).toBe('istanbul')
    expect(provinceSlug('Istanbul')).toBe('istanbul')
    expect(provinceSlug('Kıbrıs')).toBe('kktc')
    expect(provinceSlug('KKTC')).toBe('kktc')
    expect(provinceSlug('Girne')).toBe('kktc')
    expect(provinceSlug('Beşiktaş')).toBeNull()
    expect(provinceFromText('Hüseyinağa Mah. No:10, 34435 Beyoğlu/İstanbul')).toBe('istanbul')
  })
})

describe('Biletinial', () => {
  it('il listesi: İstanbul yalnız bir kez, Kıbrıs → KKTC', () => {
    const html = '<li data-id="147" data-label="İstanbul (T&#252;m&#252;)" data-url="istanbul"></li><li data-id="5" data-label="İstanbul Avrupa" data-url="istanbul-avrupa"></li><li data-id="76" data-label="Afyon" data-url="afyon"></li><li data-id="55" data-label="Kıbrıs" data-url="kibris"></li><li data-id="89" data-label="Kahramanmaraş" data-url="k-maras"></li>'
    expect(parseCities(html).map((c) => [c.id, c.slug])).toEqual([['147', 'istanbul'], ['76', 'afyonkarahisar'], ['55', 'kktc'], ['89', 'kahramanmaras']])
  })
  it('seans başına etkinlik, geçmiş ve ufuk dışı seanslar atlanır, tür bölümden', () => {
    const ev = biletinialEvents(
      { id: 50765, name: 'Kankaranlık', seoUrl: 'kankaranlik', imageUrl: '/Uploads/Films/k.jpg', cityName: 'İzmir', saloonName: 'Tiyatro Durağı', minTicketAmount: 149, seances: ['2026-11-20T20:30:00', '2026-12-02T20:30:00', '2026-12-10T20:30:00', '2027-06-01T20:30:00'], organizerUrl: 'tiyatro' },
      'tiyatro', 'Tiyatro', 'izmir', NOW, 6,
    )
    expect(ev).toHaveLength(2)
    expect(ev[0]!.startsAt).toBe('2026-12-02T17:30:00.000Z')
    expect(ev[0]!.category).toBe('theater')
    expect(ev[0]!.city).toBe('İzmir')
    expect(ev[0]!.coverImageUrl).toMatch(/^https:\/\/.+\/Uploads\/Films\/k\.jpg$/)
    expect(ev[0]!.ticketUrl).toBe('https://biletinial.com/tr-tr/tiyatro/kankaranlik')
    expect(ev[0]!.id).not.toBe(ev[1]!.id)
    expect(biletinialCategory('muzik', { categoryName: 'Müzik' })).toBe('konser')
    expect(biletinialCategory('etkinlik', { categoryName: 'Festival' })).toBe('festival')
  })
})

describe('Bugece (açık API)', () => {
  it('açıklama satırından mekân, il ve tarih', () => {
    expect(parseBugecePlain('LINSKA | Klein Phönix · Klein Phönix · Istanbul · 2026-11-27T18:00:00.000Z · Tech House, Techno')).toEqual({ venue: 'Klein Phönix', city: 'Istanbul', startsAt: '2026-11-27T18:00:00.000Z', genres: 'Tech House, Techno' })
    const e = bugeceEvent({ id: 'x1', title: 'LINSKA', description: { plain: 'LINSKA · Klein Phönix · Istanbul · 2026-11-27T18:00:00.000Z · Techno' }, url: 'https://bugece.co/event/x', media: [{ type: 'image', url: 'https://cdn.bugece.co/a' }], variants: [{ price: { amount: 75000, currency: 'TRY' } }] }, 'events')!
    expect(e.citySlug).toBe('istanbul')
    expect(e.description).toContain("750 TL")
    expect(e.coverImageUrl).toBe('https://cdn.bugece.co/a')
    expect(bugeceEvent({ id: 'x2', title: 'Yurt dışı', description: { plain: 'A · B · Berlin · 2026-11-27T18:00:00.000Z · Techno' } }, 'events')).toBeNull()
  })
})

describe('etkinlik.io', () => {
  it('site haritası ve artımlı seçim (en yeni önce, işlenenler atlanır, yeniden deneme zamanı)', () => {
    const entries = parseSitemap('https://etkinlik.io/etkinlik/10/a\nhttps://etkinlik.io/etkinlik/12/b\nhttps://etkinlik.io/etkinlik/11/c\nhttps://etkinlik.io/etkinlik/12/b')
    expect(entries.map((e) => e.id)).toEqual(['10', '12', '11'])
    expect(pickNew(entries, { '12': 1 }, NOW, 5).map((e) => e.id)).toEqual(['11', '10'])
    expect(pickNew(entries, { '11': -(NOW + 1000), '10': -(NOW - 1000) }, NOW, 5).map((e) => e.id)).toEqual(['12', '10'])
  })
  it('sayfa: il addressRegion, tür breadcrumb', () => {
    const html = `<script type="application/ld+json">{"@context":"https://schema.org","@type":"BreadcrumbList","itemListElement":[{"name":"Ana Sayfa"},{"name":"İstanbul"},{"name":"Konser"},{"name":"Pop Müzik"},{"name":"Koray Avcı"}]}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Koray Avcı","startDate":"2026-12-18T22:30:00+03:00","image":"https://x/a.png","location":{"@type":"Place","name":"Masal Sahne","address":{"streetAddress":"Cad. 1","addressLocality":"Beşiktaş","addressRegion":"İstanbul"}}}</script>`
    const e = parseEtkinlikIoPage(html, 'https://etkinlik.io/etkinlik/322885/koray-avci', '322885')!
    expect(e.citySlug).toBe('istanbul')
    expect(e.category).toBe('concert')
    expect(e.venue).toBe('Masal Sahne')
    expect(e.address).toContain('Beşiktaş')
  })
})
