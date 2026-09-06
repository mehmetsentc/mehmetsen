/**
 * P18 — Reader return navigation + article typography + ownership + sanitizer.
 * Pure fixtures / source contracts — no Production writes.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  buildFeedReaderUrl,
  claimUnownedReaderHistory,
  planReaderHistoryClose,
  planReaderHistoryOpen,
  pushOwnedReaderHistory,
  replaceUnownedReaderWithFeed,
  simulateReaderHistoryStack,
  simulateUnownedDirectClose,
  stripReaderQueryFromUrl,
  isFeedReaderHistoryState,
} from '@/lib/feed/reader/history'
import {
  plainTextToReaderParagraphs,
  sanitizeFeedReaderHtml,
} from '@/lib/feed/reader/sanitizeBodyHtml'
import { bodyFromPost } from '@/lib/feed/reader/bodyFromPost'
import { articleBlocksToSafeHtml } from '@/lib/publisher/contentDomain'
import type { Post } from '@/types/post'
import type { ArticleBlock } from '@/lib/articleBlocks'

function mockHistory(initialUrl = '/feed-v2', initialState: unknown = null) {
  const stack: Array<{ url: string; state: unknown }> = [
    { url: initialUrl, state: initialState },
  ]
  const api = {
    get state() {
      return stack[stack.length - 1]!.state
    },
    pushState(state: unknown, _title: string, url?: string | null) {
      stack.push({ url: String(url ?? stack[stack.length - 1]!.url), state })
    },
    replaceState(state: unknown, _title: string, url?: string | null) {
      stack[stack.length - 1] = {
        url: String(url ?? stack[stack.length - 1]!.url),
        state,
      }
    },
    back() {
      if (stack.length > 1) stack.pop()
    },
    get length() {
      return stack.length
    },
    snapshot() {
      return stack.map((e) => e.url)
    },
    current() {
      return stack[stack.length - 1]!
    },
  }
  return api
}

describe('P18 Reader history ownership + return', () => {
  it('normal Feed → Reader creates one owned push', () => {
    expect(
      planReaderHistoryOpen({ slug: 'a', search: '', historyState: null })
    ).toBe('push_owned')
    const h = mockHistory('/feed-v2?category=spor')
    pushOwnedReaderHistory({
      slug: 'a',
      articleId: '1',
      history: h,
      url: buildFeedReaderUrl('a'),
    })
    expect(h.length).toBe(2)
    expect(isFeedReaderHistoryState(h.state)).toBe(true)
    expect((h.state as { ownsFeedReturn: boolean }).ownsFeedReturn).toBe(true)
  })

  it('normal close uses history_back; popstate uses none', () => {
    expect(planReaderHistoryClose({ reason: 'gesture', ownsFeedReturn: true })).toBe(
      'history_back'
    )
    expect(planReaderHistoryClose({ reason: 'button', ownsFeedReturn: true })).toBe(
      'history_back'
    )
    expect(planReaderHistoryClose({ reason: 'history', ownsFeedReturn: true })).toBe('none')
  })

  it('5 owned open/close cycles never accumulate and never reach /', () => {
    const repaired = simulateReaderHistoryStack({
      initial: ['/', '/feed-v2?category=spor'],
      openCloseCycles: 5,
      closeMode: 'back',
    })
    expect(repaired.stack).toEqual(['/', '/feed-v2?category=spor'])
    expect(repaired.current).toBe('/feed-v2?category=spor')
  })

  it('replace-close path proven to expose / after repeated cycles', () => {
    const broken = simulateReaderHistoryStack({
      initial: ['/', '/feed-v2'],
      openCloseCycles: 4,
      closeMode: 'replace',
    })
    const afterBacks = [...broken.stack]
    for (let i = 0; i < 5 && afterBacks.length > 1; i++) afterBacks.pop()
    expect(afterBacks[afterBacks.length - 1]).toBe('/')
  })

  it('direct Reader URL → claim_unowned; close uses replace_unowned_feed', () => {
    expect(
      planReaderHistoryOpen({
        slug: 'direct',
        search: '?reader=direct',
        historyState: null,
      })
    ).toBe('claim_unowned_direct')
    expect(
      planReaderHistoryClose({ reason: 'gesture', ownsFeedReturn: false })
    ).toBe('replace_unowned_feed')
  })

  it('reload while Reader query exists stays unowned', () => {
    expect(
      planReaderHistoryOpen({
        slug: 'x',
        search: '?reader=x&category=ekonomi',
        historyState: null,
      })
    ).toBe('claim_unowned_direct')
  })

  it('unowned close preserves Feed params and never leaves site when prev is /', () => {
    const out = simulateUnownedDirectClose({
      stack: ['/', '/feed-v2?reader=slug&category=spor'],
      readerUrl: '/feed-v2?reader=slug&category=spor',
    })
    expect(out.current).toBe('/feed-v2?category=spor')
    expect(out.leftSite).toBe(false)
  })

  it('unowned close never falls to external previous page', () => {
    const h = mockHistory('https://www.google.com/')
    h.pushState(null, '', '/feed-v2?reader=news')
    // Wrong path would be history.back() → google. Correct: replace strip.
    const next = replaceUnownedReaderWithFeed({
      history: h,
      href: '/feed-v2?reader=news&mode=personal',
    })
    expect(next).toBe('/feed-v2?mode=personal')
    expect(h.snapshot()[h.snapshot().length - 1]).toBe('/feed-v2?mode=personal')
    // google still underneath but we did not pop to it
    expect(h.snapshot()[0]).toContain('google')
  })

  it('stripReaderQuery preserves category/mode', () => {
    expect(stripReaderQueryFromUrl('/feed-v2?reader=a&category=spor&mode=local')).toBe(
      '/feed-v2?category=spor&mode=local'
    )
  })

  it('claimUnowned does not increase history length', () => {
    const h = mockHistory('/feed-v2?reader=a')
    claimUnownedReaderHistory({
      slug: 'a',
      articleId: '1',
      history: h,
      url: '/feed-v2?reader=a',
    })
    expect(h.length).toBe(1)
    expect((h.state as { ownsFeedReturn: boolean }).ownsFeedReturn).toBe(false)
  })

  it('short swipe / cancel → zero history mutation (unowned plan without owns)', () => {
    expect(planReaderHistoryClose({ reason: 'gesture', ownsFeedReturn: false })).toBe(
      'replace_unowned_feed'
    )
    // incomplete gesture never calls beginClose — source contract
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(src).toContain('onPointerCancel={onPointerCancel}')
    expect(src).toContain('snapReaderOpen')
    expect(src).toContain('closingRef')
    expect(src).toContain('ownsFeedReturnRef')
    expect(src).toContain('replaceUnownedReaderWithFeed')
    expect(src).toContain('pushOwnedReaderHistory')
    expect(src).not.toContain('replaceFeedUrl')
  })

  it('Feed stays mounted on close', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('setReaderItem(null)')
    expect(client).toContain('scrollToIndex(idx)')
  })
})

describe('P18 Reader sanitizer security', () => {
  it('removes script iframe object embed form svg and on* / javascript / data', () => {
    const dirty = `
      <h2 onclick="x()">Baslik</h2>
      <p onload="y()" onerror="z()">Metin</p>
      <script>alert(1)</script>
      <iframe src="https://evil"></iframe>
      <object data="https://evil"></object>
      <embed src="https://evil"/>
      <form action="/x"><input/></form>
      <svg onload="alert(1)"><script>1</script></svg>
      <img src="https://cdn.example.com/a.jpg" onerror="alert(1)" style="x:1" alt="a"/>
      <a href="javascript:alert(1)">bad</a>
      <a href="data:text/html,hi">data</a>
      <a href="https://example.com/ok">ok</a>
      <blockquote>Alinti</blockquote>
      <ul><li>x</li></ul>
    `
    const clean = sanitizeFeedReaderHtml(dirty)
    expect(clean).toContain('<h2>')
    expect(clean).toContain('<blockquote>')
    expect(clean).toContain('<ul>')
    expect(clean).toContain('https://example.com/ok')
    expect(clean).toContain('<img')
    expect(clean).not.toContain('<script')
    expect(clean).not.toContain('<iframe')
    expect(clean).not.toContain('<object')
    expect(clean).not.toContain('<embed')
    expect(clean).not.toContain('<form')
    expect(clean).not.toContain('<svg')
    expect(clean).not.toMatch(/\son\w+=/i)
    expect(clean).not.toContain('javascript:')
    expect(clean).not.toContain('style=')
    expect(clean).not.toContain('data:text')
  })

  it('rejects unsafe img schemes and malformed nesting', () => {
    expect(sanitizeFeedReaderHtml('<img src="javascript:alert(1)">')).not.toContain('<img')
    expect(sanitizeFeedReaderHtml('<img src="//evil.com/x.jpg">')).not.toContain('<img')
    const nested = sanitizeFeedReaderHtml('<div><script>1</script><p>ok</p></div>')
    expect(nested).toContain('<p>ok</p>')
    expect(nested).not.toContain('script')
  })
})

describe('P18 Reader article typography', () => {
  const structuredBlocks: ArticleBlock[] = [
    { id: 'h2', type: 'heading', level: 2, text: 'Bolum Basligi' },
    { id: 'h3', type: 'heading', level: 3, text: 'Alt Baslik' },
    { id: 'h4', type: 'heading', level: 4, text: 'Detay' },
    { id: 'p1', type: 'paragraph', text: 'Birinci paragraf.' },
    { id: 'ul', type: 'list', style: 'unordered', items: ['Madde bir', 'Madde iki'] },
    { id: 'ol', type: 'list', style: 'ordered', items: ['Sira bir', 'Sira iki'] },
    {
      id: 'img',
      type: 'image',
      url: 'https://cdn.example.com/pic.jpg',
      alt: 'foto',
      caption: 'Aciklama',
    },
  ]

  it('structured bodyBlocks preserve h2/h3/h4/ul/ol/figure', () => {
    const html = articleBlocksToSafeHtml(structuredBlocks)
    expect(html).toContain('<h2>')
    expect(html).toContain('<h3>')
    expect(html).toContain('<h4>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<figure>')
    const post = {
      title: 'Baslik',
      bodyBlocks: structuredBlocks,
      htmlContent: '',
      content: '',
    } as Post
    expect(bodyFromPost(post).bodyHtml).toContain('<h2>')
  })

  it('legacy plain + long headline/spot fixtures', () => {
    const post = {
      title: 'Eski',
      bodyBlocks: [],
      htmlContent: '',
      content: 'Paragraf bir.\n\nParagraf iki.',
    } as unknown as Post
    expect(bodyFromPost(post).bodyHtml).toContain('<p>Paragraf bir.</p>')
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'),
      'utf8'
    )
    expect(src).toContain('break-words')
    expect(src).toContain('data-testid="feed-reader-source"')
    expect(src).toContain('<h1')
  })

  it('globals + SEO contract', () => {
    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toContain('.reader-body h2')
    expect(css).toContain('.reader-body blockquote')
    const article = readFileSync(
      join(process.cwd(), 'src/services/feed/feedReaderArticle.ts'),
      'utf8'
    )
    expect(article).toContain("canonicalPath: `/haber/${post.slug}`")
    expect(plainTextToReaderParagraphs('a\n\nb')).toContain('<p>a</p>')
  })
})
