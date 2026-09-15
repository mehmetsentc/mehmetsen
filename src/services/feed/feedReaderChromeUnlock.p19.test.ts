/**
 * Reader return must restore MobileNav + top chrome (no stuck smart-feed-reader-open).
 * AUTOMATED — NOT HUMAN GO / NOT deploy.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('Feed reader chrome unlock on return', () => {
  it('SmartFeedClient clears chrome lock when readerSession is null', () => {
    const feed = read('src/components/feed/smart/SmartFeedClient.tsx')
    expect(feed).toContain('if (readerSession) return')
    expect(feed).toContain("classList.remove('smart-feed-reader-open')")
    expect(feed).toContain("addEventListener('pageshow'")
  })

  it('FeedArticleReader unlocks when progress idle and not committed', () => {
    const reader = read('src/components/feed/smart/FeedArticleReader.tsx')
    expect(reader).toContain('Clear whenever the shell is effectively idle')
    expect(reader).toMatch(/committed \|\| progress > 0\.001 \|\| progressAnimating/)
    expect(reader).toContain('clearReaderChromeLock()')
  })

  it('MainLayoutClient clears chrome lock on bfcache pageshow for Feed V2', () => {
    const layout = read('src/components/layout/MainLayoutClient.tsx')
    expect(layout).toContain('event.persisted')
    expect(layout).toContain("classList.remove('smart-feed-reader-open')")
  })
})
