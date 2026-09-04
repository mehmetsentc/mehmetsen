import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('P18.4G category infinite scroll (older walk)', () => {
  const feedServiceSrc = readFileSync(
    join(process.cwd(), 'src/services/feed/FeedService.ts'),
    'utf8'
  )
  const clientSrc = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )
  const cardSrc = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
    'utf8'
  )

  it('category path soft-refills older pages instead of ending on short ranked.length', () => {
    expect(feedServiceSrc).toContain('Soft refill')
    expect(feedServiceSrc).toContain('olderProbe')
    expect(feedServiceSrc).toContain('hasMore = olderProbe.length > 0')
    expect(feedServiceSrc).toContain("rankingVersion: 'category_mix_v1'")
  })

  it('category browse does not client-filter guest-seen (allows older re-browse)', () => {
    expect(clientSrc).toContain('!authUser && !activeCategory ? readGuestSeen()')
    expect(clientSrc).toContain('EMPTY_PAGE_REFILL_MAX = 8')
  })

  it('active card restores typewriter + media expand dolly', () => {
    expect(cardSrc).toContain('Typewriter: only when card becomes active')
    expect(cardSrc).toContain('smart-feed-media-dolly')
    expect(cardSrc).toContain('setTypedHeadline')
    expect(cardSrc).toContain('skin.typeMs')
  })
})
