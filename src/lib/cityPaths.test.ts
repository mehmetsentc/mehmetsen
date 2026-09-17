import { describe, expect, it } from 'vitest'
import { isCityFeedPath, isCityImmersivePath, isCitySectionActive } from '@/lib/cityPaths'

describe('city paths', () => {
  it('treats /feed-v2 as immersive, not the magazine homepage', () => {
    expect(isCityImmersivePath('/feed-v2')).toBe(true)
    expect(isCityImmersivePath('/feed-v2/x')).toBe(true)
    expect(isCityFeedPath('/feed-v2')).toBe(false)
    expect(isCityFeedPath('/')).toBe(true)
  })

  it('marks Akış tab active only on feed-v2', () => {
    expect(isCitySectionActive('/feed-v2', '/feed-v2')).toBe(true)
    expect(isCitySectionActive('/', '/feed-v2')).toBe(false)
    expect(isCitySectionActive('/', '/')).toBe(true)
    expect(isCitySectionActive('/feed', '/')).toBe(true)
  })
})

describe('city mobile dock keeps Feed 2 visible', () => {
  it('exposes Akış as a labeled feed-v2 item', async () => {
    const { CITY_BOTTOM_NAV } = await import('@/constants/cityCategories')
    const akis = CITY_BOTTOM_NAV.find((item) => item.id === 'akis')
    expect(akis?.href).toBe('/feed-v2')
    expect(akis?.shortLabel || akis?.label).toBe('Akış')
  })

  it('city layout keeps bottom nav on immersive Akış (no chrome-less black shell)', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(join(process.cwd(), 'src/components/city/CityLayoutClient.tsx'), 'utf8')
    expect(src).toContain('<CityMobileNav />')
    expect(src).toContain('immersiveFeed')
    expect(src).not.toContain('min-h-screen bg-black')
    expect(src).not.toContain('<ReelsRouteTheme')
  })
})
