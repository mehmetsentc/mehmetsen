import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SWIPE_DISCOVERY_SETTLE_MS } from '@/lib/feed/reader/swipeDiscoveryCoach'

describe('P18 iOS Haberi Aç / card peek human NO-GO', () => {
  const client = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
    'utf8'
  )
  const coach = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
    'utf8'
  )
  const card = readFileSync(
    join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
    'utf8'
  )
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')

  it('open gesture + Haberi Aç affordance attach without capability gate', () => {
    expect(client).toContain('onOpenReaderGesture={')
    expect(client).toContain('isActive && !readerSession?.committed')
    expect(client).not.toContain(
      'feedReaderEnabled && readerCapabilityReady && isActive && !readerSession?.committed'
    )
    expect(client).toContain("? () => onRead(item, index, 'swipe_affordance')")
    expect(client).toContain('Okuyucu hazırlanıyor')
  })

  it('iOS coach: transform not on pointer-events-none root; pointerup on affordance', () => {
    expect(coach).toContain('feed-swipe-discovery-motion-shell')
    expect(coach).toContain('onPointerUp')
    expect(coach).toContain('pointer-events-auto')
    expect(coach).toContain('data-swipe-discovery-v9="1"')
    // No Tailwind translate on the none root (WebKit hit-test).
    expect(coach).not.toMatch(
      /pointer-events-none absolute[^"\n]*-translate-[xy]/
    )
    // Travel + Y-center live on inner shell.
    expect(coach).toMatch(
      /feed-swipe-discovery-motion-shell[\s\S]{0,220}translate3d\(\$\{travel\}px, -50%/
    )
    expect(SWIPE_DISCOVERY_SETTLE_MS).toBeLessThanOrEqual(900)
  })

  it('pointer capture only after horizontal lock', () => {
    expect(client).toContain('Capture only after horizontal lock')
    expect(client).toContain('setPointerCapture(ev.pointerId)')
    // Must not capture on pointerdown before axis lock.
    const downBlock = client.slice(
      client.indexOf('onPointerDown={(e) => {'),
      client.indexOf('onPointerUp={(e) => {')
    )
    expect(downBlock).not.toContain('setPointerCapture(e.pointerId)')
  })

  it('card height uses visualViewport + svh; shell synced to measured unit', () => {
    expect(client).toContain('visualViewport')
    expect(client).toContain("closest('.content-main-reels')")
    expect(css).toMatch(/--feed-card-h:\s*calc\(100svh - var\(--mobile-top-chrome-offset/)
  })

  it('Haberi Oku is gesture-ignored + pointerup safe on iOS', () => {
    expect(card).toContain('smart-feed-read-cta')
    expect(card).toContain('data-no-reader-gesture="1"')
    expect(card).toContain('onPointerUp')
    expect(card).toContain('touch-manipulation')
  })

  it('hero hit target uses touch-pan-y so iOS does not steal horizontal open', () => {
    expect(card).toContain('data-testid="smart-feed-double-tap-zone"')
    expect(card).toContain('data-feed-open-touch-action="pan-y"')
    expect(card).toMatch(/smart-feed-double-tap-zone[\s\S]{0,280}touch-pan-y|touch-pan-y[\s\S]{0,280}smart-feed-double-tap-zone/)
    expect(card).not.toMatch(/smart-feed-double-tap-zone[\s\S]{0,200}touch-manipulation/)
    expect(card).toContain('pointer-events-none absolute inset-0 bg-black')
  })
})
