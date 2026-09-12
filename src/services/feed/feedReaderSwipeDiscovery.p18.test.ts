/**
 * P18 — Swipe Discovery Coach V5: device-local, non-intercepting, key migration.
 * AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  markSwipeDiscoveryLearned,
  readSwipeDiscoveryState,
  recordSwipeDiscoveryShown,
  resetSwipeDiscoveryPresentation,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_ANIM_MS,
  SWIPE_DISCOVERY_SETTLE_MS,
  SWIPE_DISCOVERY_STORAGE_KEY,
  SWIPE_DISCOVERY_STORAGE_KEY_V1,
  SWIPE_DISCOVERY_TRAVEL_PX,
  v1WouldHaveSuppressedCoach,
  writeSwipeDiscoveryState,
} from '@/lib/feed/reader/swipeDiscoveryCoach'

const mem = new Map<string, string>()

beforeEach(() => {
  mem.clear()
  // @ts-expect-error test stub
  globalThis.localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => {
      mem.set(k, v)
    },
    removeItem: (k: string) => {
      mem.delete(k)
    },
  }
})

describe('P18 swipe discovery coach V7', () => {
  it('1-2: eligible + not learned may show across multiple cards', () => {
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    for (let i = 0; i < 5; i++) recordSwipeDiscoveryShown()
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
  })

  it('3-4: animation LEFT→RIGHT travel + pointer-events none in JSX', () => {
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeGreaterThanOrEqual(36)
    expect(SWIPE_DISCOVERY_TRAVEL_PX).toBeLessThanOrEqual(48)
    expect(SWIPE_DISCOVERY_ANIM_MS).toBeGreaterThanOrEqual(800)
    expect(SWIPE_DISCOVERY_ANIM_MS).toBeLessThanOrEqual(1100)
    expect(SWIPE_DISCOVERY_SETTLE_MS).toBeGreaterThanOrEqual(400)
    expect(SWIPE_DISCOVERY_SETTLE_MS).toBeLessThanOrEqual(900)
    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('pointer-events-none')
    expect(coach).toContain('Haberi Aç')
    expect(coach).toContain('Sola kaydır')
    expect(coach).toContain('feed-swipe-discovery-finger')
    expect(coach).toContain('feed-swipe-discovery-chevrons')
    expect(coach).toContain('feed-swipe-discovery-subtitle')
    expect(coach).toContain('SWIPE_DISCOVERY_TRAVEL_PX')
    expect(coach).toContain('isCoachPaintedInViewport')
    expect(coach).toContain('feed-swipe-discovery-affordance')
    expect(coach).not.toContain('setPointerCapture')
  })

  it('5: successful LEFT open marks learned via swipe path only', () => {
    markSwipeDiscoveryLearned()
    expect(readSwipeDiscoveryState().learned).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach()).toBe(false)
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("openSource === 'swipe' || openSource === 'swipe_affordance'")
  })

  it('6-8: Haberi Oku / cancel / vertical do not call mark outside swipe openSource', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain("openSource === 'swipe' || openSource === 'swipe_affordance'")
    expect(client).not.toMatch(/openSource === 'button'\) markSwipeDiscoveryLearned/)
  })

  it('10: V1 learned/max does NOT suppress V5 (fresh key)', () => {
    mem.set(
      SWIPE_DISCOVERY_STORAGE_KEY_V1,
      JSON.stringify({ learned: true, shownCount: 3 })
    )
    expect(v1WouldHaveSuppressedCoach()).toBe(true)
    expect(SWIPE_DISCOVERY_STORAGE_KEY).toBe('nahaber.feedSwipeDiscovery.v9')
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    expect(readSwipeDiscoveryState().learned).toBe(false)
  })

  it('12: debug replay resets presentation only', () => {
    writeSwipeDiscoveryState({ learned: true, shownCount: 3, version: 9 })
    resetSwipeDiscoveryPresentation()
    expect(readSwipeDiscoveryState()).toEqual({
      learned: false,
      shownCount: 0,
      version: 9,
    })
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    const survivor = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/ReaderNavTraceSurvivor.tsx'),
      'utf8'
    )
    expect(survivor).toContain('Replay Swipe Coach')
    expect(survivor).toContain('resetSwipeDiscoveryPresentation')
    expect(survivor).toContain('reader-nav-trace-replay-coach')
  })

  it('coach mounts on active cards; tap open still capability/debug gated', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('SwipeDiscoveryCoach')
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('showSwipeDiscoveryCoach={Boolean(')
    expect(client).toContain('isActive && !readerSession?.committed')
    expect(client).toContain('readerDebugQuery')
    expect(client).toContain("isActive && !readerSession?.committed")
    expect(client).toContain("onRead(item, index, 'swipe_affordance')")
  })
})
