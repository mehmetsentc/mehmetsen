import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  mediaCommand,
  nextUserPausedFromTap,
  userPausedAfterDeactivate,
} from '@/lib/videoFeed/playbackIntent'
import { youtubeEmbedSrc } from '@/lib/videoFeed/youtubeEmbedOrigin'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('VF2.3L mobile fill + swipe autoplay', () => {
  it('immersive mobile slides stretch; media uses a contain stage not cover-crop', () => {
    const css = read('src/app/globals.css')
    expect(css).toContain("html[data-platform='mobile'][data-immersive-video='1'] .reels-slide")
    expect(css).toContain('align-items: stretch')
    expect(css).toContain('.reels-media-stage')
    expect(css).toContain('.reels-yt-frame-box')
    expect(css).toContain('aspect-ratio: 16 / 9')
    expect(css).not.toContain('calc(var(--reels-viewport-h) * 16 / 9)')
  })

  it('does not keep a 4rem black chrome mask on mobile YouTube', () => {
    const item = read('src/components/video/VideoFeedItem.tsx')
    expect(item).toContain('reels-media-stage')
    expect(item).toContain('reels-yt-frame')
    expect(item).not.toContain('h-16 bg-black')
    expect(item).toContain('userPausedAfterDeactivate')
  })

  it('swipe to next item autoplays; explicit pause only while current', () => {
    expect(mediaCommand({ isActive: true, userPaused: false, visible: true })).toBe(
      'play'
    )
    expect(mediaCommand({ isActive: false, userPaused: false, visible: true })).toBe(
      'pause'
    )
    expect(userPausedAfterDeactivate()).toBe(false)
    expect(
      mediaCommand({
        isActive: true,
        userPaused: userPausedAfterDeactivate(),
        visible: true,
      })
    ).toBe('play')
    expect(
      nextUserPausedFromTap({ currentlyUserPaused: false, playerPlaying: false })
    ).toBe(false)
  })

  it('keeps muted autoplay params and origin encoding', () => {
    const src = youtubeEmbedSrc('dQw4w9wgGcQ', 'https://nahaber.vercel.app')
    expect(src).toContain('autoplay=1')
    expect(src).toContain('mute=1')
    expect(src).toContain('iv_load_policy=3')
    expect(src).toContain('origin=https%3A%2F%2Fnahaber.vercel.app')
  })
})
