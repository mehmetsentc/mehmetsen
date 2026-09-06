/**
 * P18 — Realistic repeated Reader session / App Router history machine.
 * Playwright is not in this repo; this is the isolated browser-level stand-in.
 * AUTOMATED — NOT HUMAN GO. No Production writes.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  beginCloseTransaction,
  canHistoryBackForOpen,
  createFeedSessionId,
  createReaderOpenId,
  finishCloseTransaction,
  mergeReaderIntoHistoryState,
  planReaderHistoryClose,
  planReaderHistoryOpen,
  pushOwnedReaderHistory,
  readReaderHistoryState,
  type FeedReaderCloseReason,
  type FeedReaderHistoryState,
  type ReaderCloseTransactionPhase,
} from '@/lib/feed/reader/history'
import {
  getReaderOpenTimings,
  markReaderOpenTiming,
  resetReaderNavTrace,
  setReaderNavTraceEnabled,
  summarizeReaderOpenTimings,
} from '@/lib/feed/reader/navTrace'

type Entry = { url: string; state: unknown }

function createAppRouterHistory(initial: Entry[]) {
  const stack: Entry[] = initial.map((e) => ({ url: e.url, state: e.state }))
  let backs = 0
  let pushes = 0
  let replaces = 0
  const api = {
    get state() {
      return stack[stack.length - 1]!.state
    },
    get length() {
      return stack.length
    },
    pushState(state: unknown, _title: string, url?: string | null) {
      pushes += 1
      stack.push({ url: String(url ?? stack[stack.length - 1]!.url), state })
    },
    replaceState(state: unknown, _title: string, url?: string | null) {
      replaces += 1
      stack[stack.length - 1] = {
        url: String(url ?? stack[stack.length - 1]!.url),
        state,
      }
    },
    back() {
      backs += 1
      if (stack.length > 1) stack.pop()
    },
    snapshot() {
      return stack.map((e) => e.url)
    },
    current() {
      return stack[stack.length - 1]!
    },
    counts() {
      return { backs, pushes, replaces }
    },
    /**
     * Models Next.js App Router: unknown/wiped state on pop causes idx decrement
     * past Feed → HOME. Only used for the failure-mode proof.
     */
    nextjsSyncAfterPop(opts: { wipedReader: boolean }) {
      if (!opts.wipedReader) return
      // Next never saw the wiped push, so popstate decrements idx past Feed → HOME.
      if (stack.length > 1 && stack[stack.length - 1]!.url.startsWith('/feed-v2')) {
        stack.pop()
      }
    },
  }
  return api
}

function homeFeedStart() {
  return createAppRouterHistory([
    { url: '/', state: { __NA: 1, idx: 0 } },
    { url: '/feed-v2', state: { __NA: 1, idx: 1 } },
  ])
}

function openAndClose(opts: {
  h: ReturnType<typeof homeFeedStart>
  slug: string
  articleId: string
  feedSessionId: string
  reason: FeedReaderCloseReason
  feedMounted: { current: boolean }
}) {
  const openId = createReaderOpenId()
  let phase: ReaderCloseTransactionPhase = 'active'
  const openPlan = planReaderHistoryOpen({
    slug: opts.slug,
    search: opts.h.current().url.includes('?') ? opts.h.current().url.slice(opts.h.current().url.indexOf('?')) : '',
    historyState: opts.h.state,
    readerOpenId: openId,
  })
  expect(openPlan === 'push_owned' || openPlan === 'claim_unowned_direct').toBe(true)
  if (openPlan === 'push_owned') {
    pushOwnedReaderHistory({
      slug: opts.slug,
      articleId: opts.articleId,
      readerOpenId: openId,
      feedSessionId: opts.feedSessionId,
      history: opts.h,
      url: `/feed-v2?reader=${opts.slug}`,
    })
  }
  expect(opts.h.current().url.startsWith('/feed-v2')).toBe(true)
  expect(opts.feedMounted.current).toBe(true)

  const started = beginCloseTransaction(phase)
  expect(started).toBe('closing')
  phase = started!
  const plan = planReaderHistoryClose({
    reason: opts.reason,
    currentState: opts.h.state,
    readerOpenId: openId,
    feedSessionId: opts.feedSessionId,
    phase: 'active',
  })
  if (opts.reason === 'history') {
    expect(plan).toBe('none')
    opts.h.back()
  } else if (plan === 'history_back') {
    opts.h.back()
  }
  // Duplicate close while CLOSING must not navigate again.
  expect(beginCloseTransaction(phase)).toBe(null)
  expect(
    planReaderHistoryClose({
      reason: 'gesture',
      currentState: opts.h.state,
      readerOpenId: openId,
      phase: 'closing',
    })
  ).toBe('none')
  phase = finishCloseTransaction()
  expect(phase).toBe('closed')
  expect(opts.feedMounted.current).toBe(true)
  expect(opts.h.current().url.startsWith('/feed-v2')).toBe(true)
  expect(opts.h.current().url).not.toBe('/')
  expect(opts.h.snapshot().includes('/')).toBe(true)
  return { openId, plan }
}

describe('P18 App Router overwrite failure (old mechanism)', () => {
  it('wiping Next history.state then back() can land on HOME', () => {
    const h = homeFeedStart()
    h.pushState(
      {
        nahaberFeedReader: true,
        articleId: '1',
        slug: 'a',
        ownsFeedReturn: true,
        readerOpenId: 'old',
        feedSessionId: 'fds',
      },
      '',
      '/feed-v2?reader=a'
    )
    h.back()
    h.nextjsSyncAfterPop({ wipedReader: true })
    expect(h.current().url).toBe('/')
  })

  it('React ownsFeedReturn=true without current state must NOT back', () => {
    expect(
      canHistoryBackForOpen({
        currentState: { __NA: 1, idx: 1 },
        readerOpenId: 'rdr_x',
        phase: 'active',
      })
    ).toBe(false)
    expect(
      planReaderHistoryClose({
        reason: 'gesture',
        currentState: { __NA: 1, idx: 1 },
        readerOpenId: 'rdr_x',
        phase: 'active',
        ownsFeedReturn: true,
      })
    ).toBe('replace_unowned_feed')
  })
})

describe('P18 merged ownership — repeated sessions', () => {
  it('HOME → FEED then 10 mixed Reader cycles never reach HOME', () => {
    const h = homeFeedStart()
    const feedSessionId = createFeedSessionId()
    const feedMounted = { current: true }
    const modes = ['swipe', 'haberi_oku'] as const
    const closes: FeedReaderCloseReason[] = [
      'gesture',
      'button',
      'history',
      'gesture',
      'button',
      'history',
      'gesture',
      'button',
      'gesture',
      'history',
    ]
    const beforeBacks = h.counts().backs
    for (let i = 0; i < 10; i++) {
      void modes[i % 2]
      const { openId } = openAndClose({
        h,
        slug: `article-${i}`,
        articleId: `id-${i}`,
        feedSessionId,
        reason: closes[i]!,
        feedMounted,
      })
      expect(openId).toBeTruthy()
      expect(h.current().url).toBe('/feed-v2')
      expect(readReaderHistoryState(h.state)).toBe(null)
    }
    expect(h.current().url).toBe('/feed-v2')
    expect(h.snapshot()[0]).toBe('/')
    expect(h.snapshot().filter((u) => u === '/').length).toBe(1)
    expect(feedMounted.current).toBe(true)
    expect(h.counts().backs - beforeBacks).toBe(10)
  })

  it('Task 10 dangerous mix never reaches HOME while closing Reader', () => {
    const h = homeFeedStart()
    const feedSessionId = createFeedSessionId()
    const feedMounted = { current: true }
    const seq: Array<{ slug: string; reason: FeedReaderCloseReason }> = [
      { slug: 'a', reason: 'gesture' },
      { slug: 'b', reason: 'history' },
      { slug: 'c', reason: 'gesture' },
      { slug: 'd', reason: 'gesture' },
      { slug: 'e', reason: 'history' },
    ]
    for (const step of seq) {
      openAndClose({
        h,
        slug: step.slug,
        articleId: step.slug,
        feedSessionId,
        reason: step.reason,
        feedMounted,
      })
      expect(h.current().url.startsWith('/feed-v2')).toBe(true)
      expect(h.current().url).not.toBe('/')
    }
    expect(h.current().url).toBe('/feed-v2')
  })

  it('short swipe / incomplete open: 0 push 0 replace 0 back', () => {
    const h = homeFeedStart()
    const before = h.counts()
    // uncommitted preview — no planReaderHistoryOpen
    expect(h.snapshot()).toEqual(['/', '/feed-v2'])
    expect(h.counts()).toEqual(before)
  })

  it('merge preserves Next idx and extra keys', () => {
    const existing = { __NA: 1, idx: 4, foo: 'keep' }
    const reader: FeedReaderHistoryState = {
      nahaberFeedReader: true,
      articleId: '1',
      slug: 'a',
      ownsFeedReturn: true,
      readerOpenId: 'rdr_1',
      feedSessionId: 'fds_1',
    }
    const merged = mergeReaderIntoHistoryState(existing, reader, { incrementIdx: true })
    expect(merged.__NA).toBe(1)
    expect(merged.idx).toBe(5)
    expect(merged.foo).toBe('keep')
    expect(merged.readerOpenId).toBe('rdr_1')
  })

  it('same feedSessionId survives every cycle', () => {
    const h = homeFeedStart()
    const feedSessionId = createFeedSessionId()
    const feedMounted = { current: true }
    const ids = new Set<string>()
    for (let i = 0; i < 5; i++) {
      const openId = createReaderOpenId()
      pushOwnedReaderHistory({
        slug: `s${i}`,
        articleId: `${i}`,
        readerOpenId: openId,
        feedSessionId,
        history: h,
        url: `/feed-v2?reader=s${i}`,
      })
      const st = readReaderHistoryState(h.state)
      expect(st?.feedSessionId).toBe(feedSessionId)
      ids.add(st!.readerOpenId)
      h.back()
    }
    expect(ids.size).toBe(5)
    expect(feedMounted.current).toBe(true)
  })
})

describe('P18 one-close + popstate + source contracts', () => {
  it('cleanup must not call history.back', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(src).toContain('Cleanup must never history.back()')
    expect(src).toContain('beginCloseTransaction')
    expect(src).toContain('canHistoryBackForOpen')
    expect(src).toContain('// Cleanup must never history.back() — only the close transaction may.')
    const lifecycleCleanup = src.slice(
      src.indexOf('// Cleanup must never history.back()'),
      src.indexOf('// Cleanup must never history.back()') + 80
    )
    expect(lifecycleCleanup).not.toContain('popReaderHistory()')
  })

  it('Feed shell stays mounted; session id is runtime-only', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('data-feed-mounted="1"')
    expect(client).toContain('createFeedSessionId')
    expect(client).toContain('feedSessionId={feedSessionIdRef.current}')
    expect(client).not.toContain('localStorage.setItem(feedSession')
  })

  it('pilot nav trace is query-gated and has no UID', () => {
    const trace = readFileSync(join(process.cwd(), 'src/lib/feed/reader/navTrace.ts'), 'utf8')
    expect(trace).toContain('readerDebug=1')
    expect(trace).not.toMatch(/uid|email|Authorization/i)
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('setReaderNavTraceEnabled(readerDebugQuery)')
  })

  it('opening timing summary is measurable without a new cache', () => {
    resetReaderNavTrace()
    setReaderNavTraceEnabled(true)
    markReaderOpenTiming('a', 'gestureAcceptedAt', 0)
    markReaderOpenTiming('a', 'stateOpenAt', 20)
    markReaderOpenTiming('a', 'firstFrameAt', 40)
    markReaderOpenTiming('a', 'bodyAvailableAt', 180)
    markReaderOpenTiming('a', 'heroResolvedAt', 90)
    markReaderOpenTiming('b', 'gestureAcceptedAt', 0)
    markReaderOpenTiming('b', 'stateOpenAt', 10)
    markReaderOpenTiming('b', 'firstFrameAt', 30)
    markReaderOpenTiming('b', 'bodyAvailableAt', 120)
    markReaderOpenTiming('b', 'heroResolvedAt', 70)
    const s = summarizeReaderOpenTimings()
    expect(s.count).toBe(2)
    expect(s.medianOpenMs).toBe(35)
    expect(s.slowestOpenMs).toBe(40)
    expect(s.medianBodyMs).toBe(150)
    expect(s.slowestBodyMs).toBe(180)
    expect(s.medianHeroMs).toBe(80)
    expect(s.slowestHeroMs).toBe(90)
    expect(getReaderOpenTimings()).toHaveLength(2)
    setReaderNavTraceEnabled(false)
    resetReaderNavTrace()
  })
})
