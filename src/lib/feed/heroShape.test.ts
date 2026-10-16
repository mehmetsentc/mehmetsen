import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { feedHeroShape, landscapeCopyGive, landscapeHeroHeight, portraitHeroHeight } from './heroShape'

describe('FEED-UX-3 photo shape', () => {
  it('classifies by real shape', () => {
    expect(feedHeroShape(16 / 9)).toBe('portrait')
    expect(feedHeroShape(5 / 4)).toBe('portrait')
    expect(feedHeroShape(9 / 16)).toBe('landscape')
    expect(feedHeroShape(1)).toBe('landscape')
    expect(feedHeroShape(null)).toBe('unknown')
  })
  it('sizes a wide photo at full width, real height, capped', () => {
    expect(landscapeHeroHeight(0.5625)).toBe('min(calc(100vw * 0.563), 48dvh)')
    expect(landscapeCopyGive(0.75)).toContain('- 26dvh')
    expect(portraitHeroHeight(1.778)).toBe('min(calc(100vw * 1.778), 100%)')
  })
  it('card uses the measured shape', () => {
    const src = readFileSync('src/components/feed/smart/FullscreenNewsCard.tsx', 'utf8')
    expect(src).toContain('data-testid="smart-feed-portrait-hero"')
    expect(src).toContain('onLoad={measureHero}')
    expect(src).toContain('landscapeHeroHeight(heroRatio)')
  })
})
