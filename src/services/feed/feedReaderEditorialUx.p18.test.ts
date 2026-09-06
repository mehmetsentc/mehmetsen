/**
 * P18 — Reader editorial presentation polish.
 * AUTOMATED — NOT HUMAN GO. No Production writes.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  looksLikeUpstreamTruncation,
  pickFullReaderCopy,
} from '@/lib/feed/reader/presentationCopy'
import { resolveReaderHero } from '@/lib/feed/reader/mediaPolicy'
import {
  planReaderHistoryClose,
  planReaderHistoryOpen,
  simulateReaderHistoryStack,
} from '@/lib/feed/reader/history'
import { sanitizeFeedReaderHtml } from '@/lib/feed/reader/sanitizeBodyHtml'

const FULL_HEADLINE =
  'Filenin Sultanları Avrupa Şampiyonu oldu ve Vargas gözyaşlarına hakim olamadı'
const FULL_SPOT =
  'A Milli Kadın Voleybol Takımı finalde İtalya’yı 3-1 yenerek Avrupa şampiyonu oldu ve salon ayakta alkışladı.'

function readerSrc() {
  return readFileSync(join(process.cwd(), 'src/components/feed/smart/FeedArticleReader.tsx'), 'utf8')
}

function cssSrc() {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
  const start = css.indexOf('Feed Reader V2')
  const end = css.indexOf('Dark floating capsule', start)
  return css.slice(start, end)
}

describe('P18 Reader editorial copy — no presentation truncation', () => {
  it('1-2. Reader headline is not line-clamped or substring-truncated', () => {
    const src = readerSrc()
    const h1 = src.slice(src.indexOf('data-testid="feed-reader-headline"'), src.indexOf('{headline}'))
    expect(h1).not.toMatch(/line-clamp/)
    expect(h1).not.toMatch(/\btruncate\b/)
    expect(h1).not.toMatch(/text-overflow/)
    expect(src).not.toMatch(/headline\.substring|headline\.slice\s*\(/)
    expect(src).toContain('pickFullReaderCopy(detail?.headline, item.headline)')
  })

  it('3-4. Reader spot is not line-clamped or substring-truncated', () => {
    const src = readerSrc()
    const spot = src.slice(src.indexOf('data-testid="feed-reader-spot"'), src.indexOf('{summary}'))
    expect(spot).not.toMatch(/line-clamp/)
    expect(spot).not.toMatch(/\btruncate\b/)
    expect(src).not.toMatch(/summary\.substring|summary\.slice\s*\(/)
    expect(src).toContain('pickFullReaderCopy(detail?.summary, item.summary)')
  })

  it('5-6. full supplied headline and spot are kept verbatim', () => {
    expect(pickFullReaderCopy(FULL_HEADLINE, FULL_HEADLINE.slice(0, 24) + '...')).toBe(
      FULL_HEADLINE
    )
    expect(pickFullReaderCopy(FULL_SPOT, FULL_SPOT.slice(0, 40))).toBe(FULL_SPOT)
    expect(pickFullReaderCopy(null, FULL_HEADLINE)).toBe(FULL_HEADLINE)
  })

  it('prefers complete spot over a shorter truncated summary', () => {
    const cut = 'A Milli Kadın Voleybol Takımı finalde İtalya’yı 3-1 yenerek...'
    expect(looksLikeUpstreamTruncation(cut)).toBe(true)
    expect(pickFullReaderCopy(cut, FULL_SPOT)).toBe(FULL_SPOT)
    expect(looksLikeUpstreamTruncation(FULL_SPOT)).toBe(false)
  })

  it('does not invent missing text when only a truncated upstream string exists', () => {
    const cut = 'Vargas gözyaşlarına hakim olamadı ve salon...'
    expect(pickFullReaderCopy(cut, null)).toBe(cut)
    expect(looksLikeUpstreamTruncation(cut)).toBe(true)
  })
})

describe('P18 Reader editorial semantics + chrome', () => {
  it('7-11. semantic H2/H3/H4/lists/figure survive sanitizer', () => {
    const html = sanitizeFeedReaderHtml(
      '<h2 style="color:red">Bolum</h2><h3 class="x">Alt</h3><h4>Detay</h4><ul><li>Bir</li></ul><ol><li>Iki</li></ol><figure><img src="https://cdn.example.com/a.jpg" alt="a"/><figcaption>Foto</figcaption></figure>'
    )
    expect(html).toContain('<h2>')
    expect(html).toContain('<h3>')
    expect(html).toContain('<h4>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<ol>')
    expect(html).toContain('<figure>')
    expect(html).toContain('<figcaption>')
    expect(html).not.toContain('style=')
    expect(html).not.toContain('class=')
  })

  it('12. source styling cannot override Reader colors', () => {
    const css = cssSrc()
    expect(css).toContain('color: var(--reader-page-text, #f4f1ea) !important')
    expect(css).toContain('color: var(--reader-prose-text, #E8E6E1) !important')
    expect(css).toContain('.feed-reader-article .reader-body h2')
    expect(css).toContain('.feed-reader-article .reader-body h3')
    expect(css).toContain('.feed-reader-article .reader-body h4')
  })

  it('13. fixed social bar does not consume final article layout space', () => {
    const src = readerSrc()
    expect(src).toContain('data-testid="feed-reader-footer-clearance"')
    expect(src).toContain('data-testid="feed-reader-footer"')
    expect(src).toContain('--reader-footer-clearance')
    expect(src).toContain('env(safe-area-inset-bottom)')
    expect(src).toContain('env(safe-area-inset-top)')
    expect(src).not.toContain('pb-28')
  })

  it('14. Reader media state behavior remains unchanged', () => {
    expect(
      resolveReaderHero({
        feedImage: 'https://cdn.example.com/a.jpg',
        detailImage: 'https://cdn.example.com/worse.jpg',
        bodySettled: true,
        imageLoad: 'ok',
        loadTimedOut: false,
      })
    ).toMatchObject({ state: 'VALID_MEDIA', url: 'https://cdn.example.com/a.jpg' })
    expect(
      resolveReaderHero({
        feedImage: 'https://cdn.example.com/a.jpg',
        detailImage: null,
        bodySettled: true,
        imageLoad: 'ok',
        loadTimedOut: true,
      }).state
    ).toBe('FAILED_MEDIA')
    expect(
      resolveReaderHero({
        feedImage: null,
        detailImage: null,
        bodySettled: true,
        imageLoad: 'pending',
        loadTimedOut: false,
      }).state
    ).toBe('NO_MEDIA')
    const src = readerSrc()
    expect(src).toContain('selectReaderHeroCandidate')
    expect(src).toContain('applyHeroRuntimeEvent')
    expect(src).toContain('Görsel yüklenemedi')
  })

  it('15. Reader history behavior remains unchanged', () => {
    expect(planReaderHistoryOpen({ slug: 'a', search: '', historyState: null })).toBe(
      'push_owned'
    )
    expect(planReaderHistoryClose({ reason: 'gesture', ownsFeedReturn: true })).toBe(
      'history_back'
    )
    const ten = simulateReaderHistoryStack({
      initial: ['/', '/feed-v2'],
      openCloseCycles: 10,
      closeMode: 'back',
    })
    expect(ten.current).toBe('/feed-v2')
    expect(ten.stack).toEqual(['/', '/feed-v2'])
  })

  it('editorial measure and hierarchy tokens are present', () => {
    const src = readerSrc()
    expect(src).toContain('clamp(1.875rem,8vw,2.625rem)')
    expect(src).toContain('leading-[1.08]')
    expect(src).toContain('text-[1.25rem]')
    expect(src).toContain('leading-[1.42]')
    expect(src).toContain('aspect-[16/9]')
    expect(src).toContain('rounded-[10px]')
    const css = cssSrc()
    expect(css).toContain('font-size: 1.7rem')
    expect(css).toContain('font-size: 1.4rem')
    expect(css).toContain('font-size: 1.2rem')
    expect(css).toContain('list-style: disc')
    expect(css).toContain('list-style: decimal')
    const tokens = readFileSync(join(process.cwd(), 'src/lib/feed/reader/tokens.ts'), 'utf8')
    expect(tokens).toContain("'--reader-body-size': '1.125rem'")
    expect(tokens).toContain("'--reader-body-leading': '1.66'")
    expect(tokens).toContain("'--reader-prose-max': '42rem'")
  })
})
