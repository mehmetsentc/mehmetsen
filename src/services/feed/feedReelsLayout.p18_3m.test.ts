import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('P18.3M feed-v2 Reels reference layout', () => {
  it('publisher sits in bottom text stack; category nav has trailing menu', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('smart-feed-publisher-row')
    expect(card).toContain('smart-feed-text-zone')
    expect(card).toContain('smart-feed-card-progress')
    expect(card).toContain('object-cover object-center')
    expect(card).toContain('line-clamp-3')
    expect(card).toContain('Haberi Oku')
    expect(card).toContain('variant="overlay"')
    // Publisher must not be the first chrome under mode nav (reference: bottom)
    const pubIdx = card.indexOf('smart-feed-publisher-row')
    const textIdx = card.indexOf('smart-feed-text-zone')
    expect(pubIdx).toBeGreaterThan(textIdx)

    const nav = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedV2CategoryNav.tsx'),
      'utf8'
    )
    expect(nav).toContain('trailing')
    expect(nav).toContain('bg-white text-black')

    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('trailing={')
    expect(client).toContain('FeedCardMenu')
    expect(client).toContain('cardIndex={index + 1}')
    expect(client).toContain('cardTotal=')
  })

  it('follow overlay uses red outline Takip et style', () => {
    const follow = readFileSync(
      join(process.cwd(), 'src/components/social/FollowButton.tsx'),
      'utf8'
    )
    expect(follow).toContain('border-[rgb(var(--color-brand))]')
    expect(follow).toContain("overlay ? 'Takip et'")
  })
})
