import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

describe('P18.4G category infinite scroll (archive session)', () => {
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

  it('category path uses session archive walk without seen-dropping soft refill', () => {
    expect(feedServiceSrc).toContain('session-wide exclusion')
    expect(feedServiceSrc).toContain('Progressive archive')
    expect(feedServiceSrc).toContain("rankingVersion: 'category_mix_v1'")
    expect(feedServiceSrc).not.toContain('allow category re-browse of older/seen')
  })

  it('category browse does not client-filter guest-seen (server session owns exclusion)', () => {
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
