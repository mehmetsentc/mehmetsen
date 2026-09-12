/**
 * P17 Feed V2 — approved visual: blur bg + sharp fg hero + readability.
 * Reader variant visual delta must remain 0. AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { resolveFeedCardSkin } from '@/lib/feed/feedCardSkins'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('P17 Feed V2 approved card visual', () => {
  it('uses blur background + sharp foreground hero (same URL architecture)', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    expect(card).toContain('smart-feed-bg-blur')
    expect(card).toContain('blur-2xl')
    expect(card).toContain('smart-feed-fg-hero')
    expect(card).toContain('aspect-[16/9]')
    expect(card).toContain('smart-feed-readability-bottom')
    expect(card).toContain('smart-feed-readability-veil')
    // No full-bleed sharp competitor over blur.
    expect(card).not.toMatch(/smart-feed-media[\s\S]*object-cover object-center will-change-transform/)
  })

  it('orphan mid-card wipe/ticker/magazine frame disabled in skins', () => {
    expect(resolveFeedCardSkin('spor').wipe).toBe(false)
    expect(resolveFeedCardSkin('ekonomi').ticker).toBe(false)
    expect(resolveFeedCardSkin('magazin').frame).toBe('none')
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    expect(card).not.toContain('smart-feed-skin-frame')
    expect(card).not.toContain('smart-feed-wipe')
  })

  it('headline/summary stay high-contrast; summary clamp when highlights', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    expect(card).toContain("showDiscoveryRail ? 'line-clamp-4' : 'line-clamp-6'")
    expect(card).toContain("data-feed-summary-clamp={showDiscoveryRail ? '4' : '6'}")
    expect(card).toContain('text-white')
    expect(card).toContain('font-extrabold')
    expect(card).toContain('pr-[3.5rem]')
  })

  it('social inset + Haberi Oku + discovery slot order preserved', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    const slotIdx = card.indexOf('smart-feed-discovery-slot')
    const scrollIdx = card.indexOf('smart-feed-copy-scroll')
    const actionIdx = card.indexOf('smart-feed-action-zone')
    expect(slotIdx).toBeGreaterThan(scrollIdx)
    expect(actionIdx).toBeGreaterThan(slotIdx)
    expect(card).toContain('smart-feed-read-cta')
    expect(card).toContain('smart-feed-social-dock')
  })
})
