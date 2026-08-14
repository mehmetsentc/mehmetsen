import { describe, expect, it } from 'vitest'
import { TURKISH_PROVINCES } from '@/constants/cities'
import {
  allProvinceLocationSeeds,
  citySmmAgentId,
  buildCityLocationInstructions,
  CITY_SMM_ROLE_INSTRUCTIONS,
  SOCIAL_DIRECTOR_INSTRUCTIONS,
} from '@/services/newsroomOs/smmPlaybook'

describe('smmPlaybook', () => {
  it('covers all 81 provinces with location instructions', () => {
    const seeds = allProvinceLocationSeeds()
    expect(seeds).toHaveLength(81)
    expect(seeds.map((s) => s.scopeKey).sort()).toEqual(
      [...TURKISH_PROVINCES.map((p) => p.slug)].sort()
    )
    for (const s of seeds) {
      expect(s.content.length).toBeGreaterThan(200)
      expect(s.content).toContain(s.scopeKey)
      expect(s.content).toContain(citySmmAgentId(s.scopeKey))
    }
  })

  it('includes Çanakkale production notes', () => {
    const canakkale = TURKISH_PROVINCES.find((p) => p.slug === 'canakkale')!
    const text = buildCityLocationInstructions(canakkale)
    expect(text).toContain('Gelibolu')
    expect(text).toMatch(/AKTİF|aktif/)
  })

  it('has detailed director and city-smm role manuals', () => {
    expect(SOCIAL_DIRECTOR_INSTRUCTIONS).toContain('SOCIAL_GENERATE')
    expect(SOCIAL_DIRECTOR_INSTRUCTIONS).toContain('81')
    expect(CITY_SMM_ROLE_INSTRUCTIONS).toContain('SOCIAL_PUBLISH')
    expect(CITY_SMM_ROLE_INSTRUCTIONS).toContain('agent-social-director')
  })
})
