import { describe, expect, it } from 'vitest'
import {
  EMPTY_INTERSTITIAL_STATE,
  READER_INTERSTITIAL_POLICY as P,
  recordOpen,
  recordShown,
  shouldOfferInterstitial,
  type InterstitialSessionState,
} from './readerInterstitialPolicy'

/** Simulate N story opens, `gapMs` apart; an ad exists every time it is offered. */
function simulate(n: number, gapMs: number): number[] {
  let s: InterstitialSessionState = { ...EMPTY_INTERSTITIAL_STATE }
  const shownAt: number[] = []
  for (let i = 1; i <= n; i++) {
    const now = i * gapMs
    s = recordOpen(s)
    if (shouldOfferInterstitial(s, now)) {
      s = recordShown(s, now)
      shownAt.push(i)
    }
  }
  return shownAt
}

describe('Feed 2 story-open ad — Dengeli frequency', () => {
  it('first 2 opens are ad-free; then at least 4 opens apart; max 5 per session', () => {
    const shown = simulate(60, 5 * 60 * 1000) // slow reader: time gap never binds
    expect(shown[0]).toBe(3)
    for (let i = 1; i < shown.length; i++) expect(shown[i]! - shown[i - 1]!).toBeGreaterThanOrEqual(P.minOpensBetween)
    expect(shown).toHaveLength(P.maxPerSession)
  })
  it('fast readers: at least 3 minutes between ads', () => {
    const shown = simulate(40, 20 * 1000) // a story every 20 s
    expect(shown[0]).toBe(3)
    expect(shown[1]).toBe(12) // 3 min / 20 s = 9 opens later
  })
  it('never on every story', () => {
    expect(simulate(10, 10 * 60 * 1000).length).toBeLessThanOrEqual(3)
  })
  it('close appears after 5 seconds', () => {
    expect(P.closeAfterSeconds).toBe(5)
  })
})
