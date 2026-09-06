/**
 * Feed Reader history — at most ONE Reader layer above the exact Feed entry.
 *
 * Close may history.back() ONLY when CURRENT history.state carries this
 * open's readerOpenId. React booleans are not ownership.
 *
 * push/replace MERGE into existing Next.js history.state (never wipe it).
 *
 * popstate close → UI only; never history.back() again.
 */

export const READER_HISTORY_STATE_KEY = 'nahaberFeedReader' as const

export type ReaderCloseTransactionPhase = 'active' | 'closing' | 'closed'

export type FeedReaderHistoryState = {
  [READER_HISTORY_STATE_KEY]: true
  articleId: string
  slug: string
  /**
   * true only when this entry was pushState'd over an existing Feed entry
   * in this app session.
   */
  ownsFeedReturn: boolean
  readerOpenId: string
  feedSessionId: string | null
}

export type FeedReaderCloseReason = 'gesture' | 'button' | 'history' | 'escape'

export type ReaderHistoryClosePlan = 'history_back' | 'replace_unowned_feed' | 'none'

export function createReaderOpenId(): string {
  return `rdr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function createFeedSessionId(): string {
  return `fds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function asRecord(state: unknown): Record<string, unknown> | null {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null
  return state as Record<string, unknown>
}

export function readReaderHistoryState(state: unknown): FeedReaderHistoryState | null {
  const s = asRecord(state)
  if (!s) return null
  if (s[READER_HISTORY_STATE_KEY] !== true) return null
  if (typeof s.articleId !== 'string' || typeof s.slug !== 'string') return null
  if (typeof s.ownsFeedReturn !== 'boolean') return null
  if (typeof s.readerOpenId !== 'string' || !s.readerOpenId) return null
  const feedSessionId = typeof s.feedSessionId === 'string' && s.feedSessionId ? s.feedSessionId : null
  return {
    [READER_HISTORY_STATE_KEY]: true,
    articleId: s.articleId,
    slug: s.slug,
    ownsFeedReturn: s.ownsFeedReturn,
    readerOpenId: s.readerOpenId,
    feedSessionId,
  }
}

export function isFeedReaderHistoryState(state: unknown): state is FeedReaderHistoryState {
  return readReaderHistoryState(state) !== null
}

/** Merge Reader ownership into existing Next.js history.state. Never wipe router keys. */
export function mergeReaderIntoHistoryState(
  existing: unknown,
  reader: FeedReaderHistoryState,
  opts?: { incrementIdx?: boolean }
): Record<string, unknown> {
  const base = asRecord(existing) ? { ...asRecord(existing)! } : {}
  if (opts?.incrementIdx && typeof base.idx === 'number' && Number.isFinite(base.idx)) {
    base.idx = base.idx + 1
  }
  return { ...base, ...reader }
}

export function stripReaderFieldsFromHistoryState(existing: unknown): Record<string, unknown> | null {
  const base = asRecord(existing)
  if (!base) return null
  const next = { ...base }
  delete next[READER_HISTORY_STATE_KEY]
  delete next.articleId
  delete next.slug
  delete next.ownsFeedReturn
  delete next.readerOpenId
  delete next.feedSessionId
  return next
}

/**
 * history.back() is allowed only for this live open, on the current entry,
 * before a close transaction starts.
 */
export function canHistoryBackForOpen(opts: {
  currentState: unknown
  readerOpenId: string
  feedSessionId?: string | null
  phase?: ReaderCloseTransactionPhase
}): boolean {
  if ((opts.phase ?? 'active') !== 'active') return false
  if (!opts.readerOpenId) return false
  const s = readReaderHistoryState(opts.currentState)
  if (!s) return false
  if (s[READER_HISTORY_STATE_KEY] !== true) return false
  if (s.readerOpenId !== opts.readerOpenId) return false
  if (opts.feedSessionId && s.feedSessionId && s.feedSessionId !== opts.feedSessionId) {
    return false
  }
  return true
}

export function beginCloseTransaction(
  phase: ReaderCloseTransactionPhase
): ReaderCloseTransactionPhase | null {
  if (phase !== 'active') return null
  return 'closing'
}

export function finishCloseTransaction(): ReaderCloseTransactionPhase {
  return 'closed'
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
  readerOpenId: string
  feedSessionId?: string | null
}): FeedReaderHistoryState {
  return {
    [READER_HISTORY_STATE_KEY]: true,
    articleId: opts.articleId,
    slug: opts.slug,
    ownsFeedReturn: opts.ownsFeedReturn,
    readerOpenId: opts.readerOpenId,
    feedSessionId: opts.feedSessionId ?? null,
  }
}

/**
 * Decide how to open Reader against current location/history.
 * Leftover previous-open ownership is never treated as this open.
 */
export function planReaderHistoryOpen(opts: {
  slug: string
  search: string
  historyState: unknown
  readerOpenId?: string
}): 'push_owned' | 'claim_unowned_direct' | 'already_owned' {
  const slugInUrl = parseReaderSlugFromSearch(opts.search)
  const state = readReaderHistoryState(opts.historyState)
  if (
    opts.readerOpenId &&
    state &&
    state.slug === opts.slug &&
    state.readerOpenId === opts.readerOpenId
  ) {
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
  readerOpenId: string
  feedSessionId?: string | null
  history?: Pick<History, 'pushState' | 'state'>
  url?: string
}): void {
  const history = opts.history ?? (typeof window !== 'undefined' ? window.history : undefined)
  if (!history) return
  const reader = buildReaderHistoryState({
    slug: opts.slug,
    articleId: opts.articleId,
    ownsFeedReturn: true,
    readerOpenId: opts.readerOpenId,
    feedSessionId: opts.feedSessionId,
  })
  const existing = 'state' in history ? history.state : null
  history.pushState(
    mergeReaderIntoHistoryState(existing, reader, { incrementIdx: true }),
    '',
    opts.url ?? buildFeedReaderUrl(opts.slug)
  )
}

/** Direct/reload: stamp marker on current entry without creating a return layer. */
export function claimUnownedReaderHistory(opts: {
  slug: string
  articleId: string
  readerOpenId: string
  feedSessionId?: string | null
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
  const reader = buildReaderHistoryState({
    slug: opts.slug,
    articleId: opts.articleId,
    ownsFeedReturn: false,
    readerOpenId: opts.readerOpenId,
    feedSessionId: opts.feedSessionId,
  })
  const existing = 'state' in history ? history.state : null
  history.replaceState(mergeReaderIntoHistoryState(existing, reader), '', url)
}

/**
 * Reason-aware history mutation for Reader close.
 * Never uses a React boolean as ownership.
 */
export function planReaderHistoryClose(opts: {
  reason: FeedReaderCloseReason
  currentState?: unknown
  readerOpenId?: string | null
  feedSessionId?: string | null
  phase?: ReaderCloseTransactionPhase
  /** @deprecated Ignored. Ownership is current history.state + readerOpenId. */
  ownsFeedReturn?: boolean
}): ReaderHistoryClosePlan {
  void opts.ownsFeedReturn
  if (opts.reason === 'history') return 'none'
  if ((opts.phase ?? 'active') !== 'active') return 'none'
  if (!opts.readerOpenId) return 'replace_unowned_feed'
  if (
    canHistoryBackForOpen({
      currentState: opts.currentState,
      readerOpenId: opts.readerOpenId,
      feedSessionId: opts.feedSessionId,
      phase: opts.phase ?? 'active',
    })
  ) {
    return 'history_back'
  }
  return 'replace_unowned_feed'
}

export function popReaderHistory(opts?: { history?: Pick<History, 'back'> }): void {
  const history = opts?.history ?? (typeof window !== 'undefined' ? window.history : undefined)
  if (!history) return
  history.back()
}

/** Safe fallback close — strip ?reader= and Reader keys; keep Next.js state. */
export function replaceUnownedReaderWithFeed(opts?: {
  history?: Pick<History, 'replaceState' | 'state'>
  href?: string
}): string {
  const history = opts?.history ?? (typeof window !== 'undefined' ? window.history : undefined)
  const href =
    opts?.href ??
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`
      : '/feed-v2?reader=x')
  const next = stripReaderQueryFromUrl(href)
  const safe = next.startsWith('/feed-v2') ? next : '/feed-v2'
  if (history) {
    const existing = 'state' in history ? history.state : null
    history.replaceState(stripReaderFieldsFromHistoryState(existing) ?? {}, '', safe)
  }
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
