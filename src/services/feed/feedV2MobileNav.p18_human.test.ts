/**
 * Human mobile regression: Sana Özel → Takip → Son Dakika → Yerel while API
 * already returned Spor/Yerel/… activity order.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildFallbackFeedV2Tabs,
  buildFeedV2Tabs,
} from '@/lib/feed/feedV2Tabs'

describe('Feed V2 mobile category nav — Takip#2 regression', () => {
  it('fallback must NOT place Takip at index 1 (human failure fingerprint)', () => {
    const fallback = buildFallbackFeedV2Tabs()
    expect(fallback[0]?.id).toBe('personal')
    expect(fallback[1]?.id).not.toBe('following')
    expect(fallback.map((t) => t.label).slice(0, 4)).not.toEqual([
      'Sana Özel',
      'Takip',
      'Son Dakika',
      'Yerel',
    ])
  })

  it('Follow (Takip) remains reachable in fallback strip (appended, not destroyed)', () => {
    const fallback = buildFallbackFeedV2Tabs()
    const idx = fallback.findIndex((t) => t.id === 'following')
    expect(idx).toBeGreaterThan(3)
    expect(fallback[idx]?.mode).toBe('following')
  })

  it('after API success while personal: activity order wins; Takip not #2', () => {
    const server = ['spor', 'yerel', 'gundem', 'yasam', 'son-dakika'] as const
    const live = buildFeedV2Tabs([...server])
    expect(live.map((t) => t.id).slice(0, 6)).toEqual([
      'personal',
      'spor',
      'yerel',
      'gundem',
      'yasam',
      'breaking',
    ])
    expect(live[1]?.id).not.toBe('following')
    expect(live.findIndex((t) => t.id === 'following')).toBeGreaterThan(5)
  })

  it('FeedV2CategoryNav must not await getClientAuthToken before tabs fetch', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedV2CategoryNav.tsx'),
      'utf8'
    )
    expect(src).toContain("/api/feed/v2/tabs")
    expect(src).toContain("cache: 'no-store'")
    expect(src).toContain("data-tabs-source")
    expect(src).not.toContain('getClientAuthToken')
    expect(src).toContain("activeTabId !== 'personal'")
    expect(src).toContain('visibilitychange')
  })

  it('Sana Özel lead + freeze/reconcile contracts remain in nav source', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedV2CategoryNav.tsx'),
      'utf8'
    )
    expect(src).toContain('frozenRef')
    expect(src).toContain('loadTabs({ force: true })')
    expect(src).toContain('buildFallbackFeedV2Tabs')
  })
})
