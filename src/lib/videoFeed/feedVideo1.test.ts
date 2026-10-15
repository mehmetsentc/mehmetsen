import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isNahaberReelVideoUrl, resolveFeedCardVideo } from './feedCardVideo'

const REEL = 'https://storage.googleapis.com/nahaberapp.firebasestorage.app/videos/reels/abc123.mp4?v=1760000000'
const read = (f: string) => readFileSync(path.join(process.cwd(), f), 'utf8')

describe('FEED-VIDEO-1 video cards in the smart feed', () => {
  it('recognises our reels only', () => {
    expect(isNahaberReelVideoUrl(REEL)).toBe(true)
    expect(resolveFeedCardVideo(REEL)?.kind).toBe('native')
    expect(isNahaberReelVideoUrl('https://storage.googleapis.com/nahaberapp.firebasestorage.app/videos/news/x.mp4')).toBe(false)
    expect(isNahaberReelVideoUrl('https://storage.googleapis.com/other/videos/reels/x.mp4')).toBe(false)
    expect(isNahaberReelVideoUrl(null)).toBe(false)
  })
  it('videos keep their original size and a reel card does not repeat its copy', () => {
    const v = read('src/components/feed/smart/SmartFeedCardVideo.tsx')
    expect(v).toContain("fit = 'contain'")
    expect(v).toContain('object-contain')
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    expect(card).toContain('fit="contain"')
    expect(card).toContain('isNahaberReelVideoUrl(item.video)')
    expect(card.match(/reelCard && 'sr-only'/g)?.length).toBe(2)
  })
})
