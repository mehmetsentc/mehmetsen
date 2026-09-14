import { formatPublicSourceLabel } from '@/lib/postUtils'
import type { HomeCategorySlug, HomeFeedInitialData, NewsItem } from '@/types/newsItem'

export const SOURCE_STORY_RAIL_LIMIT = 16
export const SOURCE_STORY_PER_GROUP = 8

export type SourceStoryGroup = {
  key: string
  label: string
  items: NewsItem[]
}

export function newsItemTime(item: NewsItem): number {
  const raw = item.publishedAt ?? item.createdAt
  if (!raw) return 0
  const t = Date.parse(raw)
  return Number.isFinite(t) ? t : 0
}

export function sourceStoryLabel(item: NewsItem): string {
  return formatPublicSourceLabel(item.source) || 'NaHaber'
}

/**
 * Presentation grouping only — does not rank or fetch.
 * Sources ordered by their newest remaining item.
 */
export function groupNewsBySource(items: NewsItem[]): SourceStoryGroup[] {
  const groups = new Map<string, SourceStoryGroup>()

  for (const item of items) {
    const label = sourceStoryLabel(item)
    const key = label.toLocaleLowerCase('tr-TR')
    const existing = groups.get(key)
    if (!existing) {
      groups.set(key, { key, label, items: [item] })
    } else {
      existing.items.push(item)
    }
  }

  for (const group of groups.values()) {
    group.items.sort((a, b) => newsItemTime(b) - newsItemTime(a))
    group.items = group.items.slice(0, SOURCE_STORY_PER_GROUP)
  }

  return [...groups.values()]
    .sort((a, b) => newsItemTime(b.items[0]!) - newsItemTime(a.items[0]!))
    .slice(0, SOURCE_STORY_RAIL_LIMIT)
}

export function collectHomeStoryCandidates(data: {
  latest: NewsItem[]
  featured?: NewsItem[]
  categoryRails?: HomeFeedInitialData['categoryRails']
}): NewsItem[] {
  const seen = new Set<string>()
  const out: NewsItem[] = []
  const push = (items?: NewsItem[]) => {
    for (const item of items ?? []) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      out.push(item)
    }
  }
  push(data.latest)
  push(data.featured)
  if (data.categoryRails) {
    for (const items of Object.values(data.categoryRails)) push(items)
  }
  return out
}

export function sourceStoryTour(groups: SourceStoryGroup[]): NewsItem[] {
  return groups
    .map((group) => group.items[0])
    .filter((item): item is NewsItem => Boolean(item))
}

export const MAGAZINE_INLINE_CATEGORY_ORDER: HomeCategorySlug[] = [
  'gundem',
  'ekonomi',
  'spor',
  'dunya',
  'siyaset',
  'saglik',
]
