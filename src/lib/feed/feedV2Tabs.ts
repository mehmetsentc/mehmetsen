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

/**
 * Resilience-only order when `/api/feed/v2/tabs` is unavailable.
 * Must NOT lead with legacy mode "Takip" — that fingerprint (Sana Özel → Takip →
 * Son Dakika → Yerel) was the human mobile regression while dynamic activity
 * already ranked Spor/Yerel/…. Keep Follow as a mode tab, but append last so a
 * transient/failed fetch cannot look like "activity order".
 */
const FALLBACK_CATEGORY_IDS = [
  'son-dakika',
  'yerel',
  ...TOP_NAV_CATEGORY_IDS.filter((id) => id !== 'asayis'),
  'following',
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

/**
 * Map an article category (incl. child yerel-* ids) onto an existing Feed V2 tab.
 * Does not invent categories — walks parentId / yerel fallback using feedV2 tab rules.
 */
export function resolveFeedV2TabForArticleCategory(
  category: string | null | undefined
): FeedV2Tab | null {
  if (!category?.trim()) return null
  const key = category.trim().toLowerCase()
  const direct = categoryTabFromId(key)
  if (direct) return direct

  const seen = new Set<string>()
  let cur = DEFAULT_CATEGORIES.find((c) => c.id === key || c.slug === key) ?? null
  while (cur?.parentId && !seen.has(cur.id)) {
    seen.add(cur.id)
    const parentTab = categoryTabFromId(cur.parentId)
    if (parentTab) return parentTab
    cur = DEFAULT_CATEGORIES.find((c) => c.id === cur!.parentId) ?? null
  }

  if (key.startsWith('yerel')) return categoryTabFromId('yerel')
  return null
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
