import { DEFAULT_CATEGORIES, TOP_NAV_CATEGORY_IDS } from '@/constants/config'
import { FEED_MODE_LABELS } from '@/lib/feed/config'
import type { FeedMode } from '@/types/smartFeed'

export type FeedV2TabKind = 'mode' | 'category'

export interface FeedV2Tab {
  id: string
  kind: FeedV2TabKind
  label: string
  /** FeedMode when kind=mode */
  mode?: FeedMode
  /** Category id when kind=category */
  category?: string
}

/** Sticky leading tabs — always before algorithmic categories. */
export const FEED_V2_LEAD_TABS: FeedV2Tab[] = [
  { id: 'personal', kind: 'mode', label: FEED_MODE_LABELS.personal, mode: 'personal' },
]

const FALLBACK_CATEGORY_IDS = [
  'following',
  'son-dakika',
  'yerel',
  ...TOP_NAV_CATEGORY_IDS.filter((id) => id !== 'asayis'),
] as const

export function categoryTabFromId(id: string): FeedV2Tab | null {
  if (id === 'following') {
    return { id: 'following', kind: 'mode', label: FEED_MODE_LABELS.following, mode: 'following' }
  }
  if (id === 'yerel') {
    return { id: 'yerel', kind: 'mode', label: FEED_MODE_LABELS.local, mode: 'local' }
  }
  if (id === 'son-dakika') {
    return { id: 'breaking', kind: 'mode', label: FEED_MODE_LABELS.breaking, mode: 'breaking' }
  }
  const cat = DEFAULT_CATEGORIES.find((c) => c.id === id || c.slug === id)
  if (!cat) return null
  return {
    id: cat.id,
    kind: 'category',
    label: cat.name,
    category: cat.id,
  }
}

/** Static fallback order when freshness API is unavailable. */
export function buildFallbackFeedV2Tabs(): FeedV2Tab[] {
  const cats = FALLBACK_CATEGORY_IDS.map(categoryTabFromId).filter(Boolean) as FeedV2Tab[]
  return [...FEED_V2_LEAD_TABS, ...cats]
}

/**
 * Lead tabs + categories ordered by freshest publish time.
 * `orderedCategoryIds` should already be parent/top-nav ids, newest first.
 */
export function buildFeedV2Tabs(orderedCategoryIds: string[]): FeedV2Tab[] {
  const seen = new Set(FEED_V2_LEAD_TABS.map((t) => t.id))
  const cats: FeedV2Tab[] = []

  for (const id of orderedCategoryIds) {
    const tab = categoryTabFromId(id)
    if (!tab || seen.has(tab.id)) continue
    seen.add(tab.id)
    cats.push(tab)
  }

  for (const id of FALLBACK_CATEGORY_IDS) {
    const tab = categoryTabFromId(id)
    if (!tab || seen.has(tab.id)) continue
    seen.add(tab.id)
    cats.push(tab)
  }

  return [...FEED_V2_LEAD_TABS, ...cats]
}

export function parseFeedV2TabFromSearch(params: {
  mode?: string | null
  category?: string | null
}): { mode: FeedMode; category: string | null; tabId: string } {
  const category = params.category?.trim().toLowerCase() || null
  if (category) {
    const tab = categoryTabFromId(category)
    if (tab?.kind === 'category') {
      return { mode: 'personal', category: tab.category!, tabId: tab.id }
    }
    if (tab?.mode) {
      return { mode: tab.mode, category: null, tabId: tab.id }
    }
  }
  const raw = (params.mode ?? 'personal').trim().toLowerCase()
  const mode: FeedMode =
    raw === 'following' || raw === 'breaking' || raw === 'local' ? raw : 'personal'
  return { mode, category: null, tabId: mode }
}
