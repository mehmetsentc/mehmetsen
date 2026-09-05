/**
 * Feed Reader history helpers — pushState while keeping Feed mounted.
 * Deep-link without Feed session should fall back to canonical /haber/{slug}.
 */

export const READER_HISTORY_STATE_KEY = 'nahaberFeedReader' as const

export type FeedReaderHistoryState = {
  [READER_HISTORY_STATE_KEY]: true
  articleId: string
  slug: string
}

export function isFeedReaderHistoryState(state: unknown): state is FeedReaderHistoryState {
  if (!state || typeof state !== 'object') return false
  const s = state as Record<string, unknown>
  return (
    s[READER_HISTORY_STATE_KEY] === true &&
    typeof s.articleId === 'string' &&
    typeof s.slug === 'string'
  )
}

/** Query used while Reader is open on /feed-v2 — non-canonical for SEO. */
export function buildFeedReaderUrl(slug: string, basePath = '/feed-v2'): string {
  const q = new URLSearchParams({ reader: slug })
  return `${basePath}?${q.toString()}`
}

export function parseReaderSlugFromSearch(search: string): string | null {
  try {
    const sp = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search)
    const slug = sp.get('reader')?.trim()
    return slug || null
  } catch {
    return null
  }
}

export function pushReaderHistory(opts: {
  slug: string
  articleId: string
  history?: Pick<History, 'pushState'>
  url?: string
}): void {
  const history = opts.history ?? (typeof window !== 'undefined' ? window.history : undefined)
  if (!history) return
  const state: FeedReaderHistoryState = {
    [READER_HISTORY_STATE_KEY]: true,
    articleId: opts.articleId,
    slug: opts.slug,
  }
  history.pushState(state, '', opts.url ?? buildFeedReaderUrl(opts.slug))
}

export function replaceFeedUrl(opts: {
  history?: Pick<History, 'replaceState'>
  url?: string
}): void {
  const history = opts.history ?? (typeof window !== 'undefined' ? window.history : undefined)
  if (!history) return
  history.replaceState(null, '', opts.url ?? '/feed-v2')
}
