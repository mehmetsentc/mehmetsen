import { describe, expect, it } from 'vitest'
import { isCityFeedPath, isCityImmersivePath, isCitySectionActive } from '@/lib/cityPaths'

describe('city paths', () => {
  it('treats city home and /feed-v2 as the same Feed 2 surface', () => {
    expect(isCityImmersivePath('/')).toBe(true)
    expect(isCityImmersivePath('/feed-v2')).toBe(true)
    expect(isCityImmersivePath('/feed-v2/x')).toBe(true)
    expect(isCityFeedPath('/feed-v2')).toBe(true)
    expect(isCityFeedPath('/')).toBe(true)
  })

  it('marks Feed tab active on home and leftover feed-v2 URLs', () => {
    expect(isCitySectionActive('/', '/')).toBe(true)
    expect(isCitySectionActive('/feed-v2', '/')).toBe(true)
    expect(isCitySectionActive('/feed', '/')).toBe(true)
    expect(isCitySectionActive('/etkinlik', '/')).toBe(false)
  })
})

describe('city mobile dock is Feed + city utilities', () => {
  it('exposes Feed, Etkinlik, İş, İlçeler — not Ana, Akış, or Spor', async () => {
    const { CITY_BOTTOM_NAV } = await import('@/constants/cityCategories')
    expect(CITY_BOTTOM_NAV.map((item) => item.id)).toEqual([
      'feed',
      'etkinlik',
      'is-ilanlari',
      'ilceler',
    ])
    expect(CITY_BOTTOM_NAV[0]?.label).toBe('Feed')
    expect(CITY_BOTTOM_NAV[0]?.href).toBe('/')
    expect(CITY_BOTTOM_NAV.some((item) => item.id === 'akis' || item.id === 'spor')).toBe(false)
  })

  it('city layout keeps bottom nav on immersive Feed 2 (no chrome-less black shell)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'src/components/city/CityLayoutClient.tsx'), 'utf8')
    expect(src).toContain('<CityMobileNav />')
    expect(src).toContain('immersiveFeed')
    expect(src).not.toContain('min-h-screen bg-black')
    expect(src).not.toContain('<ReelsRouteTheme')
  })
})
