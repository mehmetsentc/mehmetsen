import { getCategoryLabel } from '@/lib/newsMapper'
import type { NewsItem } from '@/types/newsItem'

/** Stories only include items published inside this window. */
export const CATEGORY_STORY_WINDOW_MS = 24 * 60 * 60 * 1000
/** Newest items kept per category ring. */
export const CATEGORY_STORY_PER_GROUP = 10

export type CategoryStoryGroup = {
  key: string
  label: string
  items: NewsItem[]
}

export type CategoryStoryCursor = {
  groupIndex: number
  itemIndex: number
}

export function newsItemTime(item: NewsItem): number {
  const raw = item.publishedAt ?? item.createdAt
  if (!raw) return 0
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : 0
}

/**
 * Ring key. Son Dakika items stay in their editorial category when known.
 */
export function categoryStoryKey(item: NewsItem): string | null {
  const raw = item.category?.trim()
  if (!raw) return null
  if (raw === 'son-dakika') {
    const original = item.originalCategoryId?.trim()
    return original || null
  }
  return raw
}

/**
 * Group public news into category rings.
 * Categories are ordered by their newest item. Each ring keeps at most
 * {@link CATEGORY_STORY_PER_GROUP} items from the last 24 hours, newest first.
 */
export function groupNewsByCategory(
  items: NewsItem[],
  now = Date.now()
): CategoryStoryGroup[] {
  const cutoff = now - CATEGORY_STORY_WINDOW_MS
  const groups = new Map<string, CategoryStoryGroup>()
  const seen = new Set<string>()

  const sorted = [...items].sort((a, b) => newsItemTime(b) - newsItemTime(a))

  for (const item of sorted) {
    if (seen.has(item.id)) continue
    if (newsItemTime(item) < cutoff) continue
    const key = categoryStoryKey(item)
    if (!key) continue
    seen.add(item.id)
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { key, label: getCategoryLabel(key), items: [item] })
    } else if (existing.items.length < CATEGORY_STORY_PER_GROUP) {
      existing.items.push(item)
    }
  }

  return [...groups.values()].sort(
    (a, b) => newsItemTime(b.items[0]!) - newsItemTime(a.items[0]!)
  )
}

/**
 * Step within / across category rings.
 * Forward past the last ring stays put ('end').
 */
export function stepCategoryStoryCursor(
  groups: CategoryStoryGroup[],
  cursor: CategoryStoryCursor,
  dir: 1 | -1
): CategoryStoryCursor | 'end' | 'close' {
  if (groups.length === 0) return 'close'
  const group = groups[cursor.groupIndex]
  if (!group || group.items.length === 0) return 'close'

  if (dir === 1) {
    if (cursor.itemIndex < group.items.length - 1) {
      return { groupIndex: cursor.groupIndex, itemIndex: cursor.itemIndex + 1 }
    }
    if (cursor.groupIndex < groups.length - 1) {
      return { groupIndex: cursor.groupIndex + 1, itemIndex: 0 }
    }
    return 'end'
  }

  if (cursor.itemIndex > 0) {
    return { groupIndex: cursor.groupIndex, itemIndex: cursor.itemIndex - 1 }
  }
  if (cursor.groupIndex > 0) {
    const prev = groups[cursor.groupIndex - 1]!
    return {
      groupIndex: cursor.groupIndex - 1,
      itemIndex: Math.max(0, prev.items.length - 1),
    }
  }
  return cursor
}

/**
 * Horizontal swipe jumps a whole category and lands on its newest story.
 */
export function jumpCategoryStoryGroup(
  groups: CategoryStoryGroup[],
  cursor: CategoryStoryCursor,
  dir: 1 | -1
): CategoryStoryCursor | 'end' | 'close' | 'noop' {
  if (groups.length === 0) return 'close'
  const next = cursor.groupIndex + dir
  if (next < 0) return 'noop'
  if (next >= groups.length) return 'end'
  return { groupIndex: next, itemIndex: 0 }
}
