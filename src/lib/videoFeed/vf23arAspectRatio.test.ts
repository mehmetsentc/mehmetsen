import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  MEDIA_STAGE_FIXTURES,
  containedMediaRect,
  vf23lCoverCroppedVisible,
  youtubeFrameBoxSize,
} from '@/lib/videoFeed/mediaStageGeometry'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

const RATIO_EPS = 0.01

describe('VF2.3AR original aspect ratio', () => {
  it('VF2.3L cover-crop made a 16:9 source render as the portrait slide', () => {
    const before = vf23lCoverCroppedVisible(390, 844)
    expect(before.iframeWidth).toBeCloseTo(844 * (16 / 9), 5)
    expect(before.cropped).toBe(true)
    expect(before.visibleRatio).toBeCloseTo(390 / 844, 5)
    expect(Math.abs(before.visibleRatio - 16 / 9)).toBeGreaterThan(1)
  })

  it('contain keeps source ratio for landscape, portrait, and square fixtures', () => {
    const stage = { width: 390, height: 560 }
    for (const fixture of MEDIA_STAGE_FIXTURES) {
      const rect = containedMediaRect(fixture.width, fixture.height, stage.width, stage.height)
      expect(rect.clipped).toBe(false)
      expect(rect.ratio).toBeCloseTo(fixture.ratio, 5)
      expect(rect.ratio).toBeCloseTo(rect.sourceRatio, 5)
      expect(rect.width).toBeLessThanOrEqual(stage.width + RATIO_EPS)
      expect(rect.height).toBeLessThanOrEqual(stage.height + RATIO_EPS)
    }
  })

  it('YouTube 16:9 frame box matches provider ratio on phone viewports', () => {
    const viewports = [
      { w: 390, h: 844, maxH: 574 },
      { w: 393, h: 852, maxH: 579 },
      { w: 430, h: 932, maxH: 634 },
    ]
    for (const vp of viewports) {
      const box = youtubeFrameBoxSize(vp.w, vp.maxH)
      expect(box.clipped).toBe(false)
      expect(box.ratio).toBeCloseTo(16 / 9, 5)
      expect(box.width).toBeLessThanOrEqual(vp.w + RATIO_EPS)
      expect(box.height).toBeLessThanOrEqual(vp.maxH + RATIO_EPS)
      expect(box.width).toBeCloseTo(vp.w, 5)
    }
  })

  it('CSS uses a bounded media stage instead of iframe cover-crop', () => {
    const css = read('src/app/globals.css')
    expect(css).toContain('.reels-media-stage')
    expect(css).toContain('.reels-yt-frame-box')
    expect(css).toContain('aspect-ratio: 16 / 9')
    expect(css).toContain('object-fit: contain')
    expect(css).toContain('--reels-media-stage-max-h')
    expect(css).not.toContain('.reels-yt-cover')
    expect(css).not.toContain('calc(var(--reels-viewport-h) * 16 / 9)')
    expect(css).not.toMatch(/iframe\.reels-yt-frame[\s\S]{0,200}translate\(-50%, -50%\)/)
  })

  it('YouTube and native markup keep the frame inside the media stage', () => {
    const item = read('src/components/video/VideoFeedItem.tsx')
    expect(item).toContain('reels-media-stage')
    expect(item).toContain('data-reels-media-stage')
    expect(item).toContain('reels-yt-frame-box')
    expect(item).toContain('pointer-events-none reels-yt-frame')
    expect(item).toContain('applyNativeAspectRatio')
    expect(item).not.toContain('reels-yt-cover')
    expect(item).not.toContain('h-16 bg-black')
    expect(item).not.toContain('absolute inset-0 h-full w-full object-cover object-center')
  })

  it('does not stretch native video to fill the 9:16 card', () => {
    const css = read('src/app/globals.css')
    const start = css.indexOf('.reels-media-stage .reels-video {')
    expect(start).toBeGreaterThan(0)
    const containRule = css.slice(start, start + 280)
    expect(containRule).toContain('object-fit: contain')
    expect(containRule).toContain('height: auto')
    expect(containRule).toContain('max-height: var(--reels-media-stage-max-h, 68dvh)')
  })
})
