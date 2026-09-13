import { describe, expect, it } from 'vitest'
import {
  getSharedRailDestinations,
  hrefForNewsSurface,
  newsSurfaceToggleHref,
  resolveSharedCategoryId,
  sharedRailAkisItem,
  sharedRailChipLabel,
  SHARED_RAIL_ALL_ID,
} from '@/lib/feed/sharedCategoryRail'
import { getSwipeableFeedDestinations } from '@/constants/config'
import { ROUTES } from '@/constants/routes'

describe('shared category rail', () => {
  it('reuses swipeable CAT-1B destinations — no second taxonomy', () => {
    const shared = getSharedRailDestinations()
    const swipe = getSwipeableFeedDestinations()
    expect(shared.map((d) => d.id)).toEqual(swipe.map((d) => d.id))
    expect(shared[0]?.id).toBe(SHARED_RAIL_ALL_ID)
    expect(sharedRailChipLabel(shared[0]!)).toBe('Tümü')
    expect(shared.map((d) => d.id)).toContain('gundem')
    expect(shared.map((d) => d.id)).toContain('ekonomi')
    expect(shared.map((d) => d.id)).toContain('spor')
    expect(shared.map((d) => d.id)).toContain('yerel')
    expect(shared.map((d) => d.id)).not.toContain('skor')
    expect(shared.some((d) => d.label === 'Skor')).toBe(false)
    expect(shared.some((d) => d.label === 'Sana Özel')).toBe(false)
  })

  it('resolves canonical ids from /kategori and /feed-v2 query, not labels', () => {
    expect(resolveSharedCategoryId('/kategori/gundem')).toBe('gundem')
    expect(resolveSharedCategoryId('/feed-v2', '?category=ekonomi')).toBe('ekonomi')
    expect(resolveSharedCategoryId('/feed-v2', '?mode=local')).toBe('yerel')
    expect(resolveSharedCategoryId('/feed-v2')).toBe(SHARED_RAIL_ALL_ID)
    expect(resolveSharedCategoryId('/feed')).toBe(SHARED_RAIL_ALL_ID)
    expect(resolveSharedCategoryId('/yerel')).toBe('yerel')
  })

  it('preserves category across Ana Sayfa ↔ Akış via ids', () => {
    expect(newsSurfaceToggleHref('akis', '/kategori/gundem')).toBe(
      `${ROUTES.FEED_V2}?category=gundem`
    )
    expect(newsSurfaceToggleHref('home', '/feed-v2', '?category=ekonomi')).toBe(
      '/kategori/ekonomi'
    )
    expect(newsSurfaceToggleHref('akis', '/feed')).toBe(ROUTES.FEED_V2)
    expect(newsSurfaceToggleHref('home', '/feed-v2')).toBe(ROUTES.FEED)
    expect(newsSurfaceToggleHref('akis', '/yerel')).toBe(`${ROUTES.FEED_V2}?mode=local`)
    expect(newsSurfaceToggleHref('home', '/feed-v2', '?mode=local')).toBe(ROUTES.LOCAL)
  })

  it('maps Tümü to personal Smart Feed mode; spor to category tab', () => {
    const dests = getSharedRailDestinations()
    const all = sharedRailAkisItem(dests[0]!)
    expect(all.kind).toBe('tab')
    if (all.kind === 'tab') {
      expect(all.tab.id).toBe('personal')
      expect(all.tab.mode).toBe('personal')
    }
    const spor = dests.find((d) => d.id === 'spor')!
    const sporItem = sharedRailAkisItem(spor)
    expect(sporItem.kind).toBe('tab')
    if (sporItem.kind === 'tab') {
      expect(sporItem.tab.category).toBe('spor')
    }
    expect(hrefForNewsSurface('akis', 'spor')).toBe(`${ROUTES.FEED_V2}?category=spor`)
  })
})
