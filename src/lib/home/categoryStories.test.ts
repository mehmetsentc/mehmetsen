import { describe, expect, it } from 'vitest'
import {
  CATEGORY_STORY_PER_GROUP,
  CATEGORY_STORY_WINDOW_MS,
  groupNewsByCategory,
  jumpCategoryStoryGroup,
  stepCategoryStoryCursor,
} from '@/lib/home/categoryStories'
import type { NewsItem } from '@/types/newsItem'

const NOW = Date.parse('2026-09-24T00:00:00.000Z')

function item(
  id: string,
  category: string,
  minutesAgo: number,
  extra: Partial<NewsItem> = {}
): NewsItem {
  return {
    id,
    slug: id,
    title: id,
    category,
    publishedAt: new Date(NOW - minutesAgo * 60_000).toISOString(),
    ...extra,
  }
}

describe('groupNewsByCategory', () => {
  it('orders categories by their newest story and caps each ring at 10 within 24h', () => {
    const items = [
      item('old-spor', 'spor', 25 * 60),
      item('spor-new', 'spor', 5),
      item('spor-mid', 'spor', 30),
      item('gundem-1', 'gundem', 10),
      ...Array.from({ length: 12 }, (_, i) => item(`eko-${i}`, 'ekonomi', 40 + i)),
    ]

    const groups = groupNewsByCategory(items, NOW)
    expect(groups.map((g) => g.key)).toEqual(['spor', 'gundem', 'ekonomi'])
    expect(groups[0]?.items.map((n) => n.id)).toEqual(['spor-new', 'spor-mid'])
    expect(groups[2]?.items).toHaveLength(CATEGORY_STORY_PER_GROUP)
    expect(groups[2]?.items[0]?.id).toBe('eko-0')
    expect(groups[2]?.items.some((n) => n.id === 'eko-11')).toBe(false)
  })

  it('drops anything older than 24 hours and parks breaking news in its original category', () => {
    const groups = groupNewsByCategory(
      [
        item('stale', 'siyaset', CATEGORY_STORY_WINDOW_MS / 60_000 + 5),
        item('break', 'son-dakika', 2, { originalCategoryId: 'siyaset' }),
        item('plain', 'siyaset', 8),
      ],
      NOW
    )
    expect(groups).toHaveLength(1)
    expect(groups[0]?.key).toBe('siyaset')
    expect(groups[0]?.label).toBeTruthy()
    expect(groups[0]?.items.map((n) => n.id)).toEqual(['break', 'plain'])
  })
})

describe('category story cursor', () => {
  const groups = groupNewsByCategory(
    [
      item('a1', 'gundem', 1),
      item('a2', 'gundem', 2),
      item('b1', 'spor', 3),
    ],
    NOW
  )

  it('steps through a category then into the next', () => {
    expect(stepCategoryStoryCursor(groups, { groupIndex: 0, itemIndex: 0 }, 1)).toEqual({
      groupIndex: 0,
      itemIndex: 1,
    })
    expect(stepCategoryStoryCursor(groups, { groupIndex: 0, itemIndex: 1 }, 1)).toEqual({
      groupIndex: 1,
      itemIndex: 0,
    })
    expect(stepCategoryStoryCursor(groups, { groupIndex: 1, itemIndex: 0 }, 1)).toBe('end')
  })

  it('jumps a whole category on a sideways swipe', () => {
    expect(jumpCategoryStoryGroup(groups, { groupIndex: 0, itemIndex: 1 }, 1)).toEqual({
      groupIndex: 1,
      itemIndex: 0,
    })
    expect(jumpCategoryStoryGroup(groups, { groupIndex: 0, itemIndex: 0 }, -1)).toBe('noop')
  })
})
