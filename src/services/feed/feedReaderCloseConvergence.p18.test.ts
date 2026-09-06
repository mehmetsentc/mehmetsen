/**
 * P18 — RIGHT-swipe close must converge with BACK ARROW; Safari must not co-own.
 * AUTOMATED — NOT HUMAN GO.
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
  planReaderHistoryClose,
  pushOwnedReaderHistory,
  readReaderHistoryState,
  type FeedReaderCloseReason,
} from '@/lib/feed/reader/history'

type Entry = { url: string; state: unknown }

function createHistory(initial: Entry[]) {
  const stack: Entry[] = initial.map((e) => ({ ...e }))
  let backs = 0
  const api = {
    get state() {
      return stack[stack.length - 1]!.state
    },
    pushState(state: unknown, _t: string, url?: string | null) {
      stack.push({ url: String(url ?? stack[stack.length - 1]!.url), state })
    },
    replaceState(state: unknown, _t: string, url?: string | null) {
      stack[stack.length - 1] = {
        url: String(url ?? stack[stack.length - 1]!.url),
        state,
      }
    },
    back() {
      backs += 1
      if (stack.length > 1) stack.pop()
    },
    current() {
      return stack[stack.length - 1]!
    },
    backs() {
      return backs
    },
  }
  return api
}

function closeOnce(opts: {
  h: ReturnType<typeof createHistory>
  openId: string
  feedSessionId: string
  reason: FeedReaderCloseReason
}) {
  let phase = beginCloseTransaction('active')
  expect(phase).toBe('closing')
  const plan = planReaderHistoryClose({
    reason: opts.reason,
    currentState: opts.h.state,
    readerOpenId: opts.openId,
    feedSessionId: opts.feedSessionId,
    phase: 'active',
  })
  if (opts.reason === 'history') {
    expect(plan).toBe('none')
    opts.h.back()
  } else if (plan === 'history_back') {
    opts.h.back()
  }
  expect(beginCloseTransaction(phase!)).toBe(null)
  expect(
    planReaderHistoryClose({
      reason: 'gesture',
      currentState: opts.h.state,
      readerOpenId: opts.openId,
      phase: 'closing',
    })
  ).toBe('none')
  phase = finishCloseTransaction()
  expect(phase).toBe('closed')
}

describe('P18 BACK ARROW vs RIGHT SWIPE close convergence', () => {
  it('button and gesture share the same history plan for owned opens', () => {
    const owned = {
      nahaberFeedReader: true as const,
      articleId: '1',
      slug: 'a',
      ownsFeedReturn: true,
      readerOpenId: 'rdr_1',
      feedSessionId: 'fds_1',
    }
    expect(
      planReaderHistoryClose({
        reason: 'button',
        currentState: owned,
        readerOpenId: 'rdr_1',
        phase: 'active',
      })
    ).toBe('history_back')
    expect(
      planReaderHistoryClose({
        reason: 'gesture',
        currentState: owned,
        readerOpenId: 'rdr_1',
        phase: 'active',
      })
    ).toBe('history_back')
    expect(
      planReaderHistoryClose({
        reason: 'history',
        currentState: owned,
        readerOpenId: 'rdr_1',
        phase: 'active',
      })
    ).toBe('none')
  })

  it('10 sequential RIGHT-swipe closes never reach HOME', () => {
    const h = createHistory([
      { url: '/', state: { __NA: 1, idx: 0 } },
      { url: '/feed-v2', state: { __NA: 1, idx: 1 } },
    ])
    const feedSessionId = createFeedSessionId()
    for (let i = 0; i < 10; i++) {
      const openId = createReaderOpenId()
      pushOwnedReaderHistory({
        slug: `a${i}`,
        articleId: `${i}`,
        readerOpenId: openId,
        feedSessionId,
        history: h,
        url: `/feed-v2?reader=a${i}`,
      })
      closeOnce({ h, openId, feedSessionId, reason: 'gesture' })
      expect(h.current().url).toBe('/feed-v2')
      expect(h.current().url).not.toBe('/')
      expect(readReaderHistoryState(h.state)).toBe(null)
    }
    expect(h.backs()).toBe(10)
  })

  it('mixed LEFT/RIGHT/BACK ARROW sequence never reaches HOME', () => {
    const h = createHistory([
      { url: '/', state: { __NA: 1, idx: 0 } },
      { url: '/feed-v2', state: { __NA: 1, idx: 1 } },
    ])
    const feedSessionId = createFeedSessionId()
    const reasons: FeedReaderCloseReason[] = [
      'gesture',
      'button',
      'history',
      'gesture',
      'button',
      'gesture',
    ]
    for (let i = 0; i < reasons.length; i++) {
      const openId = createReaderOpenId()
      pushOwnedReaderHistory({
        slug: `m${i}`,
        articleId: `m${i}`,
        readerOpenId: openId,
        feedSessionId,
        history: h,
        url: `/feed-v2?reader=m${i}`,
      })
      closeOnce({ h, openId, feedSessionId, reason: reasons[i]! })
      expect(h.current().url.startsWith('/feed-v2')).toBe(true)
    }
  })

  it('stale React ownership without current state cannot history.back', () => {
    expect(
      canHistoryBackForOpen({
        currentState: { __NA: 1, idx: 1 },
        readerOpenId: 'rdr_x',
        phase: 'active',
      })
    ).toBe(false)
  })
})

describe('P18 Reader close source contracts', () => {
  it('BACK ARROW and RIGHT swipe both call beginClose; pan-y blocks Safari co-ownership', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(src).toContain("onClick={() => beginClose('button')}")
    expect(src).toContain("beginClose('gesture')")
    expect(src).toContain("beginCloseRef.current('history')")
    expect(src).toContain("touchAction: 'pan-y'")
    expect(src).toContain("overscrollBehaviorX: 'none'")
    expect(src).toContain("data-reader-touch-action={committed ? 'pan-y' : 'auto'}")
    expect(src).toContain('pointercancel must NEVER complete a close')
    expect(src).toContain('Cleanup must never history.back()')
  })
})
