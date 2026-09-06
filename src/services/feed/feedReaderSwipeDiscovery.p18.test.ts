/**
 * P18 — Swipe Discovery Coach: device-local, non-intercepting.
 * AUTOMATED — NOT HUMAN GO.
 */
import { describe, expect, it, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  markSwipeDiscoveryLearned,
  readSwipeDiscoveryState,
  recordSwipeDiscoveryShown,
  shouldShowSwipeDiscoveryCoach,
  SWIPE_DISCOVERY_STORAGE_KEY,
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

describe('P18 swipe discovery coach', () => {
  it('new device may show coach; learned device does not', () => {
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    recordSwipeDiscoveryShown()
    recordSwipeDiscoveryShown()
    recordSwipeDiscoveryShown()
    expect(shouldShowSwipeDiscoveryCoach()).toBe(false)
    writeSwipeDiscoveryState({ learned: false, shownCount: 0 })
    expect(shouldShowSwipeDiscoveryCoach()).toBe(true)
    markSwipeDiscoveryLearned()
    expect(readSwipeDiscoveryState().learned).toBe(true)
    expect(shouldShowSwipeDiscoveryCoach()).toBe(false)
  })

  it('coach is decorative: pointer-events none; Haberi Oku and TRACE unaffected', () => {
    const coach = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SwipeDiscoveryCoach.tsx'),
      'utf8'
    )
    expect(coach).toContain('pointer-events-none')
    expect(coach).toContain('← Kaydır')
    expect(coach).not.toContain('preventDefault')
    expect(coach).not.toContain('setPointerCapture')
    expect(coach).not.toContain('addEventListener')
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('SwipeDiscoveryCoach')
    expect(card).toContain('smart-feed-read-cta')
    const survivor = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/ReaderNavTraceSurvivor.tsx'),
      'utf8'
    )
    expect(survivor).toContain('data-trace-collapsed="1"')
    expect(SWIPE_DISCOVERY_STORAGE_KEY).toContain('SwipeDiscovery')
  })

  it('successful LEFT open marks learned via openReader swipe path', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('markSwipeDiscoveryLearned')
    expect(client).toContain("if (openSource === 'swipe') markSwipeDiscoveryLearned()")
  })
})
