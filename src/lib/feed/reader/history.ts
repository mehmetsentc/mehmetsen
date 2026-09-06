/**
 * Feed Reader history — at most ONE Reader layer above the exact Feed entry.
 *
 * Normal Feed → Reader:
 *   pushState({ ownsFeedReturn: true }, ?reader=slug)
 *   close → history.back() exactly once
 *
 * Direct / reload /feed-v2?reader=slug (no owned Feed layer underneath):
 *   replaceState({ ownsFeedReturn: false }) to stamp ownership marker
 *   close → replaceState strip ?reader= only (NEVER history.back() — would leave site)
 *
 * popstate close → UI only; never history.back() again.
 */

export const READER_HISTORY_STATE_KEY = 'nahaberFeedReader' as const

export type FeedReaderHistoryState = {
  [READER_HISTORY_STATE_KEY]: true
  articleId: string
  slug: string
  /**
   * true only when this entry was pushState'd over an existing Feed entry
   * in this app session — safe to history.back() on close.
   */
  ownsFeedReturn: boolean
}

export type FeedReaderCloseReason = 'gesture' | 'button' | 'history' | 'escape'

export type ReaderHistoryClosePlan = 'history_back' | 'replace_unowned_feed' | 'none'

export function isFeedReaderHistoryState(state: unknown): state is FeedReaderHistoryState {
  if (!state || typeof state !== 'object') return false
  const s = state as Record<string, unknown>
  return (
    s[READER_HISTORY_STATE_KEY] === true &&
    typeof s.articleId === 'string' &&
    typeof s.slug === 'string' &&
    typeof s.ownsFeedReturn === 'boolean'
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

/** Strip only `reader` — preserve mode/category/other Feed params. */
export function stripReaderQueryFromUrl(href: string): string {
  try {
    const u = new URL(href, 'https://www.nahaber.com')
    u.searchParams.delete('reader')
    const q = u.searchParams.toString()
    return q ? `${u.pathname}?${q}` : u.pathname
  } catch {
    return '/feed-v2'
  }
}

export function buildReaderHistoryState(opts: {
  slug: string
  articleId: string
  ownsFeedReturn: boolean
}): FeedReaderHistoryState {
  return {
    [READER_HISTORY_STATE_KEY]: true,
    articleId: opts.articleId,
    slug: opts.slug,
    ownsFeedReturn: opts.ownsFeedReturn,
  }
}

/**
 * Decide how to open Reader against current location/history.
 * Direct/reload with ?reader= already present → claim entry, do not push.
 */
export function planReaderHistoryOpen(opts: {
  slug: string
  search: string
  historyState: unknown
}): 'push_owned' | 'claim_unowned_direct' | 'already_owned' {
  const slugInUrl = parseReaderSlugFromSearch(opts.search)
  const state = isFeedReaderHistoryState(opts.historyState) ? opts.historyState : null
  if (state && state.slug === opts.slug && state.ownsFeedReturn) {
    return 'already_owned'
  }
  if (slugInUrl === opts.slug) {
    return 'claim_unowned_direct'
  }
  return 'push_owned'
}

export function pushOwnedReaderHistory(opts: {
  slug: string
  articleId: string
  history?: Pick<History, 'pushState'>
  url?: string
}): void {
  const history = opts.history ?? (typeof window !== 'undefined' ? window.history : undefined)
  if (!history) return
  history.pushState(
    buildReaderHistoryState({
      slug: opts.slug,
      articleId: opts.articleId,
      ownsFeedReturn: true,
    }),
    '',
    opts.url ?? buildFeedReaderUrl(opts.slug)
  )
}

/** Direct/reload: stamp marker on current entry without creating a return layer. */
export function claimUnownedReaderHistory(opts: {
  slug: string
  articleId: string
  history?: Pick<History, 'replaceState' | 'state'>
  url?: string
}): void {
  const history = opts.history ?? (typeof window !== 'undefined' ? window.history : undefined)
  if (!history) return
  const url =
    opts.url ??
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : buildFeedReaderUrl(opts.slug))
  history.replaceState(
    buildReaderHistoryState({
      slug: opts.slug,
      articleId: opts.articleId,
      ownsFeedReturn: false,
    }),
    '',
    url
  )
}

/**
 * Reason-aware history mutation for Reader close.
 * - ownsFeedReturn → history.back() once
 * - unowned direct/reload → replaceState strip ?reader= only
 * - popstate → none (already moved)
 */
export function planReaderHistoryClose(opts: {
  reason: FeedReaderCloseReason
  ownsFeedReturn: boolean
}): ReaderHistoryClosePlan {
  if (opts.reason === 'history') return 'none'
  if (opts.ownsFeedReturn) return 'history_back'
  return 'replace_unowned_feed'
}

export function popReaderHistory(opts?: { history?: Pick<History, 'back'> }): void {
  const history = opts?.history ?? (typeof window !== 'undefined' ? window.history : undefined)
  if (!history) return
  history.back()
}

/** Safe fallback close for unowned direct Reader entry — never navigates off /feed-v2. */
export function replaceUnownedReaderWithFeed(opts?: {
  history?: Pick<History, 'replaceState'>
  href?: string
}): string {
  const history = opts?.history ?? (typeof window !== 'undefined' ? window.history : undefined)
  const href =
    opts?.href ??
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/feed-v2?reader=x')
  const next = stripReaderQueryFromUrl(href)
  // Guard: must remain on feed-v2
  const safe = next.startsWith('/feed-v2') ? next : '/feed-v2'
  if (history) history.replaceState(null, '', safe)
  return safe
}

/**
 * @deprecated Normal close must not use this — stacks duplicate /feed-v2 entries.
 * Kept for failure-mode tests only.
 */
export function replaceFeedUrl(opts: {
  history?: Pick<History, 'replaceState'>
  url?: string
}): void {
  const history = opts.history ?? (typeof window !== 'undefined' ? window.history : undefined)
  if (!history) return
  history.replaceState(null, '', opts.url ?? '/feed-v2')
}

/** Pure stack model for tests — proves replace-close path to `/`. */
export function simulateReaderHistoryStack(opts: {
  initial: string[]
  openCloseCycles: number
  closeMode: 'replace' | 'back'
}): { stack: string[]; current: string } {
  const stack = [...opts.initial]
  for (let i = 0; i < opts.openCloseCycles; i++) {
    stack.push(`/feed-v2?reader=article-${i}`)
    if (opts.closeMode === 'replace') {
      stack[stack.length - 1] = '/feed-v2'
    } else {
      stack.pop()
    }
  }
  return { stack, current: stack[stack.length - 1] ?? '/' }
}

/** Pure model: unowned close never pops into previous site entry. */
export function simulateUnownedDirectClose(opts: {
  stack: string[]
  readerUrl: string
}): { stack: string[]; current: string; leftSite: boolean } {
  const stack = [...opts.stack]
  // Current is readerUrl (direct) — close via strip, not back
  const next = stripReaderQueryFromUrl(opts.readerUrl)
  if (stack.length && stack[stack.length - 1] === opts.readerUrl) {
    stack[stack.length - 1] = next
  } else {
    stack.push(next)
  }
  const current = stack[stack.length - 1]!
  return {
    stack,
    current,
    leftSite: current === '/' || !current.startsWith('/feed-v2'),
  }
}
