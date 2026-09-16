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
