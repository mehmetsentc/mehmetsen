import { describe, expect, it } from 'vitest'
import {
  applyAstrologyCategoryOverride,
  applyMasterChefCategoryOverride,
  looksLikeAstrologyContent,
  looksLikeMasterChefTurkiyeContent,
} from '@/lib/categoryOverrides'

describe('astrology category override', () => {
  it('detects daily horoscope titles', () => {
    expect(looksLikeAstrologyContent('Yay burcu günlük burç yorumu — 21 Temmuz')).toBe(true)
    expect(looksLikeAstrologyContent("İstanbul'da metro arızası")).toBe(false)
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

describe('MasterChef Türkiye category override', () => {
  it('detects MasterChef Türkiye TV competition', () => {
    expect(
      looksLikeMasterChefTurkiyeContent(
        'Eleme adayları Recep ve Enes',
        'MasterChef Türkiye 2026 dokunulmazlık oyunu.',
        ['masterchef türkiye', 'eleme adayı']
      )
    ).toBe(true)
  })

  it('forces magazin instead of dunya', () => {
    expect(
      applyMasterChefCategoryOverride(
        'dunya',
        'Eleme adayları Recep ve Enes',
        'MasterChef Türkiye 2026 eleme adayları Recep ve Enes için kritik gece.',
        ['masterchef türkiye', 'dokunulmazlık oyunu']
      )
    ).toBe('magazin')
  })

  it('keeps gastronomi when already set', () => {
    expect(
      applyMasterChefCategoryOverride(
        'gastronomi',
        'MasterChef Türkiye',
        'Yarışmacılar eleme adayı oldu.',
        ['masterchef']
      )
    ).toBe('gastronomi')
  })
})
