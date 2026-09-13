import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('VF2.3S /video swipe-scroll contract', () => {
  it('maps every feed item including virtualized snap anchors', () => {
    const feed = read('src/components/video/VideoFeed.tsx')
    expect(feed).toContain('displayVideos.map')
    expect(feed).toContain('virtualized={!inWindow}')
    expect(feed).toContain('windowStart = Math.max(0, activeIndex - 1)')
    expect(feed).toContain('windowEnd = activeIndex + 3')
    expect(feed).toContain("scrollSnapType: 'y mandatory'")
    expect(feed).toContain('reels-scroll-container')
  })

  it('observer and programmatic scroll target the snap container', () => {
    const hook = read('src/hooks/useInfiniteScroll.ts')
    expect(hook).toContain('{ root: container')
    expect(hook).toContain('container.scrollTo({ top: el.offsetTop, behavior })')
    expect(hook).not.toContain('el.scrollIntoView')
  })

  it('YouTube iframe does not capture wheel/touch; interceptor keeps pause taps', () => {
    const item = read('src/components/video/VideoFeedItem.tsx')
    expect(item).toContain('pointer-events-none reels-yt-frame')
    expect(item).toContain('touch-pan-y')
    expect(item).toContain('nextUserPausedFromTap')
    expect(item).toContain('youtubeEmbedParentOrigin')
    expect(item).not.toContain('origin=https://nahaber.com')
  })

  it('native-slide role policy does not collapse the slide list to the current item', () => {
    const feed = read('src/components/video/VideoFeed.tsx')
    expect(feed).toContain('nativePreloadRoleFor(index, activeIndex)')
    expect(feed).toContain('displayVideos.map((video, index)')
    const policy = read('src/lib/videoFeed/nativePreloadPolicy.ts')
    expect(policy).toContain("if (index === activeIndex) return 'current'")
    expect(policy).toContain("if (index === activeIndex + 1) return 'next'")
  })
})
