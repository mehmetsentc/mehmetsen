import { describe, expect, it } from 'vitest'
import {
  applyAstrologyCategoryOverride,
  looksLikeAstrologyContent,
} from '@/lib/categoryOverrides'

describe('astrology category override', () => {
  it('detects daily horoscope titles', () => {
    expect(looksLikeAstrologyContent('Yay burcu günlük burç yorumu — 21 Temmuz')).toBe(true)
    expect(looksLikeAstrologyContent('İstanbul\'da metro arızası')).toBe(false)
  })

  it('forces astroloji instead of yasam', () => {
    expect(
      applyAstrologyCategoryOverride(
        'yasam',
        'Yay burcu günlük burç yorumu',
        'Bugün ilişkilerde hassas davranın.',
        ['yay burcu', 'astroloji']
      )
    ).toBe('astroloji')
  })

  it('leaves unrelated categories alone', () => {
    expect(
      applyAstrologyCategoryOverride('spor', 'Fenerbahçe derbiye hazır', 'Maç öncesi antrenman.')
    ).toBe('spor')
  })
})
