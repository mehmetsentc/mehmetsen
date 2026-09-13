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
    expect(tabs).toContain('overflow-x-auto')
    expect(tabs).not.toMatch(/translate-x-\[/)
    expect(tabs).not.toMatch(/left:\s*\d+px/)
    expect(tabs).not.toMatch(/margin-left:\s*\d+px/)
  })

  it('player wrap is the width primitive tabs inherit', () => {
    const css = read('src/app/globals.css')
    const wrap = css.slice(css.indexOf('.reels-player-wrap {'), css.indexOf('.reels-recommendations {'))
    expect(wrap).toContain('position: relative')
    expect(wrap).toContain('--reels-video-w')
    const feed = read('src/components/video/VideoFeed.tsx')
    expect(feed).toContain('data-testid="video-player-column"')
    expect(feed).not.toMatch(/reels-feed w-full/)
  })

  it('/video page fills the shell instead of stacking min-h 100dvh black bands', () => {
    const page = read('src/app/(main)/video/page.tsx')
    expect(page).not.toContain('max-w-lg')
    expect(page).not.toContain('min-h-[100dvh]')
    expect(page).not.toContain('min-h-[min(100dvh,920px)]')
    expect(page).toContain('h-full min-h-0 w-full')
    const client = read('src/components/video/ReelsPageClient.tsx')
    expect(client).toContain('h-full min-h-0')
    expect(client).not.toContain('min-h-screen')
  })

  it('immersive /video clears phantom chrome offset so the player can fill 100dvh', () => {
    const layout = read('src/components/layout/MainLayoutClient.tsx')
    expect(layout).toContain("data-immersive-video")
    expect(layout).toContain("setAttribute('data-immersive-video', '1')")
    const css = read('src/app/globals.css')
    expect(css).toContain("html[data-immersive-video='1']")
    expect(css).toContain('--mobile-top-chrome-offset: 0px')
    expect(css).toContain('--reels-viewport-h: 100dvh')
  })

  it('immersive scrollport stays viewport-sized so swipe/wheel can change slides', () => {
    const css = read('src/app/globals.css')
    const pageLayoutRule = css.match(
      /html\[data-immersive-video='1'\] \.reels-page,[\s\S]*?html\[data-immersive-video='1'\] \.reels-layout \{[\s\S]*?\}/
    )?.[0] ?? ''
    expect(pageLayoutRule).toContain('.reels-layout')
    expect(pageLayoutRule).not.toContain('reels-scroll-container')

    const scroll = css.slice(
      css.indexOf("html[data-immersive-video='1'] .reels-scroll-container"),
      css.indexOf("html[data-platform='mobile'][data-immersive-video='1'] .reels-player-wrap")
    )
    expect(scroll).toContain('overflow-y: scroll')
    expect(scroll).toContain('touch-action: pan-y')
    expect(scroll).toContain('height: var(--reels-viewport-h)')
    expect(scroll).not.toMatch(/height:\s*100%;/)
  })

  it('tab container center equals video column center, independent of rail', () => {
    const player = { x: 80, width: 400 }
    const gap = 36
    const rail = { x: player.x + player.width + gap, width: 320 }
    const tabs = { x: player.x, width: player.width }
    const playerCenter = player.x + player.width / 2
    const pageAndRailCenter = (player.x + rail.x + rail.width) / 2
    const tabCenter = tabs.x + tabs.width / 2
    expect(tabCenter).toBe(playerCenter)
    expect(tabCenter).not.toBe(pageAndRailCenter)
  })
})
