import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { buildSeoDescription, buildSeoHashtags, socialLocationFromDoc, toHashtag, withLocationLine } from './socialSeo'
import { extractPlaceId, pickPlaceHit, placeKeys } from './placeResolver'

const doc = {
  title: 'Gelibolu Kavakköy\'de traktör altında kalan işçi öldü',
  city: 'Çanakkale', citySlug: 'canakkale', district: 'Gelibolu', districtSlug: 'gelibolu',
  location: { city: 'Çanakkale', district: 'Gelibolu', lat: 40.41, lng: 26.67 },
  tags: ['traktör kazası', 'iş kazası', 'Çanakkale', 'haber'],
}

describe('SOCIAL-SEO-1 location', () => {
  it('reads the stored geo fields', () => {
    const l = socialLocationFromDoc(doc)
    expect(l.label).toBe('Gelibolu, Çanakkale')
    expect([l.lat, l.lng]).toEqual([40.41, 26.67])
    expect(socialLocationFromDoc({ city: 'Türkiye' }).label).toBeNull()
    expect(socialLocationFromDoc({ city: 'ANTALYA', district: 'Merkez' }).label).toBe('Antalya')
  })
  it('place keys and ids', () => {
    expect(placeKeys({ citySlug: 'canakkale', districtSlug: 'gelibolu' })).toEqual(['canakkale__gelibolu', 'canakkale'])
    expect(placeKeys({ citySlug: 'canakkale', districtSlug: 'merkez' })).toEqual(['canakkale'])
    expect(extractPlaceId('https://www.facebook.com/profile.php?id=108047225883520')).toBe('108047225883520')
    expect(extractPlaceId('108047225883520')).toBe('108047225883520')
    expect(extractPlaceId('Çanakkale')).toBeNull()
    const hit = pickPlaceHit(
      [
        { id: '1111111', name: 'Gelibolu Belediyesi', location: { city: 'Istanbul', country: 'Turkey' } },
        { id: '2222222', name: 'Gelibolu', location: { city: 'Çanakkale', country: 'Turkey' } },
      ],
      { city: 'Çanakkale', district: 'Gelibolu' },
    )
    expect(hit?.id).toBe('2222222')
  })
})

describe('SOCIAL-SEO-1 hashtags', () => {
  it('exactly 5, most specific first, no generic padding', () => {
    const tags = buildSeoHashtags({ location: socialLocationFromDoc(doc), categoryLabel: 'Yerel Asayiş', tags: doc.tags })
    expect(tags).toEqual(['#Çanakkale', '#Gelibolu', '#Asayiş', '#TraktörKazası', '#İşKazası'])
    expect(toHashtag("Çanakkale'de")).toBe('#Çanakkalede')
    expect(toHashtag('2026')).toBeNull()
    const few = buildSeoHashtags({ location: { city: 'Antalya', district: null }, categoryLabel: 'Ekonomi', breaking: true })
    expect(few).toEqual(['#Antalya', '#Ekonomi', '#AntalyaHaber', '#SonDakika', '#Gündem'])
  })
})

describe('SOCIAL-SEO-1 description', () => {
  it('lead + new facts from the body + location, whole sentences only', () => {
    const d = buildSeoDescription({
      title: doc.title,
      spot: 'Gelibolu\'nun Kavakköy\'ünde besi çiftliğinde traktörün altında kalan 37 yaşındaki işçi hayatını kaybetti.',
      body: 'Gelibolu\'nun Kavakköy\'ünde besi çiftliğinde traktörün altında kalan 37 yaşındaki işçi hayatını kaybetti. Olay sabah saatlerinde meydana geldi. İhbar üzerine bölgeye sağlık ve jandarma ekipleri sevk edildi. Ölümle ilgili inceleme başlatıldı. Bu cümle de var ama yer kalmazsa girmez.',
      location: { label: 'Gelibolu, Çanakkale' },
    })
    const parts = d.split('\n\n')
    expect(parts[0]).toContain('hayatını kaybetti.')
    expect(parts[1]).toContain('Olay sabah saatlerinde meydana geldi.')
    expect(parts[1]).not.toContain('hayatını kaybetti')
    expect(parts.at(-1)).toBe('📍 Gelibolu, Çanakkale')
  })
  it('adds the location line once', () => {
    expect(withLocationLine('Metin.', { label: 'Antalya' })).toBe('Metin.\n\n📍 Antalya')
    expect(withLocationLine('Metin.\n\n📍 Antalya', { label: 'Antalya' })).toBe('Metin.\n\n📍 Antalya')
  })
})
