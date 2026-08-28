import { describe, expect, it } from 'vitest'
import { collectSportMatches, parseSportParam } from '@/lib/sports/collectMatches'

describe('parseSportParam', () => {
  it('maps aliases', () => {
    expect(parseSportParam('futbol')).toBe('futbol')
    expect(parseSportParam('soccer')).toBe('futbol')
    expect(parseSportParam('basketball')).toBe('basketbol')
    expect(parseSportParam('volleyball')).toBe('voleybol')
    expect(parseSportParam(null)).toBe('all')
  })
})

describe('collectSportMatches', () => {
  it(
    'returns football program when season is between matchdays',
    async () => {
      const r = await collectSportMatches('futbol')
      expect(r.matches.length).toBeGreaterThan(0)
      expect(r.matches.every((m) => m.sport === 'futbol')).toBe(true)
      expect(['Program', 'Bugün', 'Son sonuçlar'].some((l) => r.dateLabel.includes(l) || r.dateLabel.includes('canlı'))).toBe(
        true
      )
    },
    30_000
  )

  it(
    'returns basketball matches from ESPN/TheSportsDB',
    async () => {
      const r = await collectSportMatches('basketbol')
      expect(r.matches.length).toBeGreaterThan(0)
      expect(r.matches.every((m) => m.sport === 'basketbol')).toBe(true)
    },
    30_000
  )

  it(
    'returns volleyball matches around today',
    async () => {
      const r = await collectSportMatches('voleybol')
      expect(Array.isArray(r.matches)).toBe(true)
      expect(r.matches.every((m) => m.sport === 'voleybol')).toBe(true)
    },
    30_000
  )
}, 60_000)
