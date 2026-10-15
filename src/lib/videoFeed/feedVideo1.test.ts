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
    expect(v).toContain("fit = 'auto'")
    expect(v).toContain('object-contain')
    expect(v).toContain('setUpright(v.videoHeight >= v.videoWidth * 1.1)')
    const card = read('src/components/feed/smart/FullscreenNewsCard.tsx')
    // FEED-UX-2d: video at its original size (full width, own height), Reels layout
    expect(card).toContain('fit="reels"')
    expect(v).toContain("bottom: 'var(--feed-v2-bottom-clearance, 4.5rem)'")
    expect(card).toContain("const HERO_FRAME = 'relative min-h-[26dvh] w-full flex-1 overflow-hidden'")
    expect(card).toContain('object-contain object-center')
    expect(card).toContain('isNahaberReelVideoUrl(item.video)')
    expect(card.match(/reelCard && 'sr-only'/g)?.length).toBeGreaterThanOrEqual(2)
  })
})
