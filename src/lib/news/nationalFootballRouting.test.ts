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
