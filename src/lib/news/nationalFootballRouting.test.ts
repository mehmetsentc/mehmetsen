import { describe, expect, it } from 'vitest'
import {
  detectNationalFootballClub,
  normalizeFootballMatchText,
  resolveNationalFootballLocalRouting,
} from '@/lib/news/nationalFootballRouting'

describe('detectNationalFootballClub', () => {
  it('matches Beşiktaş with Turkish apostrophe suffix', () => {
    const match = detectNationalFootballClub("Beşiktaş'ın Avrupa maçı şifresiz yayınlanacak")
    expect(match?.clubName).toBe('Beşiktaş')
    expect(match?.categoryId).toBe('futbol')
    expect(match?.league).toBe('super-lig')
  })

  it('matches Galatasaray and Fenerbahçe', () => {
    expect(detectNationalFootballClub('Galatasaray transfer görüşmesi')?.clubName).toBe('Galatasaray')
    expect(detectNationalFootballClub('Fenerbahçe yeni transfer')?.clubName).toBe('Fenerbahçe')
  })

  it('matches 1. Lig club Konyaspor context via super lig list', () => {
    expect(detectNationalFootballClub('Konyaspor maçı ertelendi')?.clubName).toBe('Konyaspor')
  })

  it('matches Trendyol 1. Lig club', () => {
    const match = detectNationalFootballClub('Sakaryaspor deplasmanda kazandı')
    expect(match?.clubName).toBe('Sakaryaspor')
    expect(match?.league).toBe('tff-1-lig')
  })

  it('returns null for unrelated local sports', () => {
    expect(detectNationalFootballClub('Çanakkale amatör lig maçı')).toBeNull()
  })

  it('does not treat a city dateline as the club (Hatay asayiş ≠ Hatayspor)', () => {
    expect(
      detectNationalFootballClub(
        "Yasa dışı bahis operasyonunda Hatay'da 4 ilde 37 şüpheli yakalandı"
      )
    ).toBeNull()
    expect(
      resolveNationalFootballLocalRouting(
        "Yasa dışı bahis operasyonunda Hatay'da 4 ilde 37 şüpheli yakalandı",
        'hatay'
      )
    ).toBeNull()
  })

  it('does not map belediye / asayiş / siyaset city news to futbol', () => {
    expect(detectNationalFootballClub("Konya'da belediye otobüs seferleri değişti")).toBeNull()
    expect(detectNationalFootballClub("Diyarbakır'ın Hazro ilçesinde elektrik kesintisi")).toBeNull()
    expect(detectNationalFootballClub('Saadet Partisi Ankara’da açıklama yaptı')).toBeNull()
    expect(
      resolveNationalFootballLocalRouting("Antalya'da hayvan pazarı denetimi", 'antalya')
    ).toBeNull()
  })

  it('still maps a real club + match to futbol', () => {
    expect(detectNationalFootballClub('Hatayspor deplasmanda kazandı')?.clubName).toBe('Hatayspor')
    expect(detectNationalFootballClub("Hatay 2-1 kazandı")?.clubName).toBe('Hatayspor')
    expect(
      resolveNationalFootballLocalRouting('Konyaspor maçı ertelendi', 'konya')?.clubName
    ).toBe('Konyaspor')
  })
})

describe('resolveNationalFootballLocalRouting', () => {
  it('requires citySlug for local routing', () => {
    expect(
      resolveNationalFootballLocalRouting("Beşiktaş'ın maçı", null)
    ).toBeNull()
    expect(
      resolveNationalFootballLocalRouting("Beşiktaş'ın maçı", 'istanbul')
    ).not.toBeNull()
  })

  it('skips abroad articles', () => {
    expect(
      resolveNationalFootballLocalRouting('Beşiktaş maçı', 'istanbul', true)
    ).toBeNull()
  })
})

describe('normalizeFootballMatchText', () => {
  it('strips Turkish diacritics', () => {
    expect(normalizeFootballMatchText('Beşiktaş')).toBe('besiktas')
  })
})
