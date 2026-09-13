import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

function read(rel: string) {
  return readFileSync(join(process.cwd(), rel), 'utf8')
}

describe('VF2.2 video tabs sit on the player column', () => {
  it('VideoSurfaceTabs render inside reels-player-wrap, not the page+rail flex row', () => {
    const feed = read('src/components/video/VideoFeed.tsx')
    const wrapIdx = feed.indexOf('reels-player-wrap')
    const tabsIdx = feed.indexOf('<VideoSurfaceTabs')
    const recsIdx = feed.indexOf('<ReelsRecommendations')
    expect(wrapIdx).toBeGreaterThan(0)
    expect(tabsIdx).toBeGreaterThan(wrapIdx)
    expect(recsIdx).toBeGreaterThan(tabsIdx)

    const wrapBlock = feed.slice(wrapIdx, recsIdx)
    expect(wrapBlock).toContain('<VideoSurfaceTabs')
    expect(feed.slice(0, wrapIdx)).not.toContain('<VideoSurfaceTabs')
  })

  it('tabs use player-width inset centering without page/rail pixel offsets', () => {
    const tabs = read('src/components/video/VideoSurfaceTabs.tsx')
    expect(tabs).toContain('data-testid="video-surface-tabs"')
    expect(tabs).toContain('absolute inset-x-0')
    expect(tabs).toContain('justify-center')
    expect(tabs).not.toMatch(/translate-x-\[/)
    expect(tabs).not.toMatch(/left:\s*\d+px/)
    expect(tabs).not.toMatch(/margin-left:\s*\d+px/)
  })

  it('player wrap is the width primitive tabs inherit', () => {
    const css = read('src/app/globals.css')
    const wrap = css.slice(css.indexOf('.reels-player-wrap {'), css.indexOf('.reels-recommendations {'))
    expect(wrap).toContain('position: relative')
    expect(wrap).toContain('--reels-video-w')
  })
})
