/**
 * Phase 2 — swipe HUD must sit on media, never on headline/body. AUTOMATED.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('swipe HUD media placement Phase 2', () => {
  it('open coach mounts inside the fg hero / media fallback, not chrome copy', () => {
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    const coach = read('src/components/feed/smart/SwipeDiscoveryCoach.tsx')
    expect(card).toContain('smart-feed-fg-hero')
    expect(card).toContain('<SwipeDiscoveryCoach')
    expect(card).not.toContain('Coach in CHROME layer')
    expect(coach).toContain('data-swipe-hud-region="media"')
    expect(coach).toContain("top: '62%'")
    expect(coach).not.toContain('--feed-v2-top-clearance')
    expect(coach).toContain('pointer-events-none')
    expect(coach).toContain('Haberi Aç')
    expect(coach).toContain('Sola kaydır')
  })

  it('return coach mounts on reader hero media, not a body-centered 38% overlay', () => {
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    const coach = read('src/components/feed/smart/ReaderReturnCoach.tsx')
    expect(reader).toContain('returnCoach')
    expect(reader).toContain('feed-reader-hero')
    expect(reader).toContain('onAffordanceActivate={() => beginClose(\'gesture\')}')
    expect(coach).toContain('data-reader-hud-region="media"')
    expect(coach).not.toContain('top-[38%]')
    expect(coach).toContain("top: '58%'")
    expect(coach).toContain('Akışa Dön')
    expect(coach).toContain('sağa kaydır')
    expect(coach).toContain('pointer-events-none')
  })
})
