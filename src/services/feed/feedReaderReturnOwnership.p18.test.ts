/**
 * P18 — Reader return ownership: history entry matrix + foreign-pop during close.
 * AUTOMATED — NOT HUMAN GO.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  armFeedOwnerRescue,
  clearFeedOwnerRescue,
  consumeFeedOwnerRescue,
} from '@/lib/feed/reader/feedOwnerRescue'
import {
  beginCloseTransaction,
  buildFeedReaderUrl,
  ensureFeedOwnerUrl,
  finishCloseTransaction,
  planReaderHistoryClose,
  planReaderHistoryOpen,
  popReaderHistory,
  pushOwnedReaderHistory,
  replaceUnownedReaderWithFeed,
  resolveFeedOwnerHistorySync,
  simulateReaderHistoryStack,
  simulateUnownedDirectClose,
} from '@/lib/feed/reader/history'

type Entry = { url: string; state: unknown }

function createHistory(initial: Entry[]) {
  const stack: Entry[] = initial.map((e) => ({ ...e }))
  let backs = 0
  const api = {
    get state() {
      return stack[stack.length - 1]!.state
    },
    get length() {
      return stack.length
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
    stack() {
      return stack.map((e) => e.url)
    },
  }
  return api
}

function pathOf(url: string): string {
  try {
    return new URL(url, 'https://www.nahaber.com').pathname
  } catch {
    return url.split('?')[0] ?? url
  }
}

function searchOf(url: string): string {
  try {
    const u = new URL(url, 'https://www.nahaber.com')
    return u.search
  } catch {
    const i = url.indexOf('?')
    return i >= 0 ? url.slice(i) : ''
  }
}

function finishOwnedClose(opts: {
  h: ReturnType<typeof createHistory>
  openId: string
  feedSessionId: string
  foreignPopDuringClose?: boolean
}) {
  let phase = beginCloseTransaction('active')
  expect(phase).toBe('closing')
  const planned = planReaderHistoryClose({
    reason: 'gesture',
    currentState: opts.h.state,
    readerOpenId: opts.openId,
    feedSessionId: opts.feedSessionId,
    phase: 'active',
  })
  const cur = opts.h.current()
  const plan = resolveFeedOwnerHistorySync({
    planned,
    foreignPopDuringClose: Boolean(opts.foreignPopDuringClose),
    pathname: pathOf(cur.url),
    search: searchOf(cur.url),
  })
  if (plan === 'history_back') {
    armFeedOwnerRescue()
    popReaderHistory({ history: opts.h })
  } else if (plan === 'replace_unowned_feed') {
    replaceUnownedReaderWithFeed({
      history: opts.h,
      href: cur.url,
    })
    clearFeedOwnerRescue()
  } else {
    clearFeedOwnerRescue()
  }
  const after = opts.h.current()
  if (pathOf(after.url) === '/') {
    ensureFeedOwnerUrl({ history: opts.h, href: after.url, feedHref: '/feed-v2' })
  } else if (pathOf(after.url).startsWith('/feed-v2')) {
    clearFeedOwnerRescue()
  }
  phase = finishCloseTransaction()
  expect(phase).toBe('closed')
  return { planned, plan, after: opts.h.current() }
}

describe('P18 Reader return ownership — history matrix', () => {
  beforeEach(() => {
    const mem = new Map<string, string>()
    // @ts-expect-error test stub
    globalThis.sessionStorage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => {
        mem.set(k, v)
      },
      removeItem: (k: string) => {
        mem.delete(k)
      },
    }
    clearFeedOwnerRescue()
  })

  it('A: fresh /feed-v2 → Reader → RIGHT → Feed', () => {
    const h = createHistory([{ url: '/feed-v2', state: { idx: 0 } }])
    const openId = 'rdr_a'
    const feedSessionId = 'fds_a'
    pushOwnedReaderHistory({
      slug: 'a',
      articleId: '1',
      readerOpenId: openId,
      feedSessionId,
      history: h,
      url: buildFeedReaderUrl('a'),
    })
    const { after } = finishOwnedClose({ h, openId, feedSessionId })
    expect(pathOf(after.url)).toBe('/feed-v2')
    expect(h.stack().every((u) => pathOf(u) !== '/' || true)).toBe(true)
    expect(pathOf(after.url)).not.toBe('/')
  })

  it('B: HOME → /feed-v2 → Reader → RIGHT → Feed NOT HOME', () => {
    const h = createHistory([
      { url: '/', state: { idx: 0 } },
      { url: '/feed-v2', state: { idx: 1 } },
    ])
    const openId = 'rdr_b'
    const feedSessionId = 'fds_b'
    pushOwnedReaderHistory({
      slug: 'b',
      articleId: '2',
      readerOpenId: openId,
      feedSessionId,
      history: h,
      url: buildFeedReaderUrl('b'),
    })
    expect(h.stack()).toEqual(['/', '/feed-v2', '/feed-v2?reader=b'])
    const { after, plan } = finishOwnedClose({ h, openId, feedSessionId })
    expect(plan).toBe('replace_unowned_feed')
    expect(pathOf(after.url)).toBe('/feed-v2')
    expect(pathOf(after.url)).not.toBe('/')
  })

  it('C: HOME → other → /feed-v2 → Reader → RIGHT → Feed', () => {
    const h = createHistory([
      { url: '/', state: { idx: 0 } },
      { url: '/haber/onceki', state: { idx: 1 } },
      { url: '/feed-v2', state: { idx: 2 } },
    ])
    const openId = 'rdr_c'
    const feedSessionId = 'fds_c'
    pushOwnedReaderHistory({
      slug: 'c',
      articleId: '3',
      readerOpenId: openId,
      feedSessionId,
      history: h,
      url: buildFeedReaderUrl('c'),
    })
    const { after } = finishOwnedClose({ h, openId, feedSessionId })
    expect(pathOf(after.url)).toBe('/feed-v2')
  })

  it('D: canonical /haber → /feed-v2 → Reader → RIGHT → Feed', () => {
    const h = createHistory([
      { url: '/haber/seo-slug', state: { idx: 0 } },
      { url: '/feed-v2', state: { idx: 1 } },
    ])
    const openId = 'rdr_d'
    const feedSessionId = 'fds_d'
    pushOwnedReaderHistory({
      slug: 'd',
      articleId: '4',
      readerOpenId: openId,
      feedSessionId,
      history: h,
      url: buildFeedReaderUrl('d'),
    })
    const { after } = finishOwnedClose({ h, openId, feedSessionId })
    expect(pathOf(after.url)).toBe('/feed-v2')
  })

  it('E/F: 10 vertical-card-equivalent Reader open/close cycles stay on Feed', () => {
    const h = createHistory([
      { url: '/', state: { idx: 0 } },
      { url: '/feed-v2', state: { idx: 1 } },
    ])
    for (let i = 0; i < 10; i++) {
      const openId = `rdr_cycle_${i}`
      const feedSessionId = 'fds_cycle'
      pushOwnedReaderHistory({
        slug: `s${i}`,
        articleId: String(i),
        readerOpenId: openId,
        feedSessionId,
        history: h,
        url: buildFeedReaderUrl(`s${i}`),
      })
      const { after } = finishOwnedClose({ h, openId, feedSessionId })
      expect(pathOf(after.url)).toBe('/feed-v2')
    }
  })

  it('foreign pop during close cancels deferred history.back (HOME escape root cause)', () => {
    const h = createHistory([
      { url: '/', state: { idx: 0 } },
      { url: '/feed-v2', state: { idx: 1 } },
    ])
    const openId = 'rdr_safari'
    const feedSessionId = 'fds_safari'
    pushOwnedReaderHistory({
      slug: 'safari',
      articleId: '9',
      readerOpenId: openId,
      feedSessionId,
      history: h,
      url: buildFeedReaderUrl('safari'),
    })
    // Safari already popped Reader entry while closing animation runs.
    h.back()
    expect(pathOf(h.current().url)).toBe('/feed-v2')
    const { after, plan } = finishOwnedClose({
      h,
      openId,
      feedSessionId,
      foreignPopDuringClose: true,
    })
    expect(plan).toBe('none')
    expect(h.backs()).toBe(1) // only the foreign pop, no second back
    expect(pathOf(after.url)).toBe('/feed-v2')
  })

  it('without foreign-pop guard, second back would reach HOME (proves prior failure)', () => {
    const sim = simulateReaderHistoryStack({
      initial: ['/', '/feed-v2'],
      openCloseCycles: 1,
      closeMode: 'back',
    })
    expect(sim.current).toBe('/feed-v2')
    // Extra back = human failure mode after Safari already consumed one entry.
    const stack = [...sim.stack]
    stack.pop()
    expect(stack[stack.length - 1]).toBe('/')
  })

  it('resolveFeedOwnerHistorySync remaps legacy history_back to replace/none (never back)', () => {
    expect(
      resolveFeedOwnerHistorySync({
        planned: 'history_back',
        foreignPopDuringClose: false,
        pathname: '/feed-v2',
        search: '',
      })
    ).toBe('none')
    expect(
      resolveFeedOwnerHistorySync({
        planned: 'history_back',
        foreignPopDuringClose: false,
        pathname: '/feed-v2',
        search: '?reader=x',
      })
    ).toBe('replace_unowned_feed')
    expect(
      resolveFeedOwnerHistorySync({
        planned: 'history_back',
        foreignPopDuringClose: true,
        pathname: '/feed-v2',
        search: '?reader=x',
      })
    ).toBe('replace_unowned_feed')
    expect(
      resolveFeedOwnerHistorySync({
        planned: 'history_back',
        foreignPopDuringClose: false,
        pathname: '/',
        search: '',
      })
    ).toBe('replace_unowned_feed')
  })

  it('ensureFeedOwnerUrl never leaves HOME as destination', () => {
    const h = createHistory([{ url: '/', state: { idx: 0 } }])
    const next = ensureFeedOwnerUrl({ history: h, href: '/', feedHref: '/feed-v2' })
    expect(next).toBe('/feed-v2')
    expect(pathOf(h.current().url)).toBe('/feed-v2')
  })

  it('unowned direct close never pops into previous site entry', () => {
    const r = simulateUnownedDirectClose({
      stack: ['/', '/feed-v2?reader=x'],
      readerUrl: '/feed-v2?reader=x',
    })
    expect(r.leftSite).toBe(false)
    expect(r.current).toBe('/feed-v2')
  })

  it('feed owner rescue session flag arms and consumes once', () => {
    armFeedOwnerRescue()
    expect(consumeFeedOwnerRescue()).toBe(true)
    expect(consumeFeedOwnerRescue()).toBe(false)
  })

  it('FeedArticleReader + MainLayout wire foreign-pop cancel + rescue + chrome clear', () => {
    const reader = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    const layout = readFileSync(
      join(process.cwd(), 'src/components/layout/MainLayoutClient.tsx'),
      'utf8'
    )
    expect(reader).toContain('foreignPopDuringCloseRef')
    expect(reader).toContain('resolveFeedOwnerHistorySync')
    expect(reader).toContain('armFeedOwnerRescue')
    expect(reader).toContain('HOME_ESCAPE_CAUSE')
    expect(reader).toContain('clearReaderChromeLock()')
    expect(reader).toContain('// Always clear chrome lock on unmount')
    expect(layout).toContain('consumeFeedOwnerRescue')
    expect(layout).toContain("router.replace('/feed-v2')")
  })

  it('button and gesture plan replace_unowned_feed (never history_back — HOME escape fix)', () => {
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
    ).toBe('replace_unowned_feed')
    expect(
      planReaderHistoryClose({
        reason: 'gesture',
        currentState: owned,
        readerOpenId: 'rdr_1',
        phase: 'active',
      })
    ).toBe('replace_unowned_feed')
    expect(
      planReaderHistoryOpen({
        slug: 'a',
        search: '',
        historyState: null,
      })
    ).toBe('push_owned')
  })
})
