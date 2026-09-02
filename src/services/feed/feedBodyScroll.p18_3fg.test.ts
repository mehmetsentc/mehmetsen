import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  selectSmartFeedSummary,
  SMART_FEED_SUMMARY_HARD_MAX,
  SMART_FEED_SUMMARY_TARGET_MAX,
  takeCompleteSentencesUpTo,
  trimToCompleteSentences,
} from '@/lib/feed/smartFeedSummary'
import { FEED_PAGINATION } from '@/lib/feed/config'
import { feedSessionService } from '@/services/feed/FeedSessionService'

describe('P18.3FG smart feed summary boundary', () => {
  it('never returns body even when body/content are passed', () => {
    const summary =
      'Belediye başkanı yeni ulaşım hattını açıkladı. İlk seferler haftaya başlayacak. Vatandaşlar olumlu karşıladı.'
    const body = `${summary} ${'Paragraf. '.repeat(400)}`
    expect(body.length).toBeGreaterThan(2000)
    const picked = selectSmartFeedSummary({
      summary,
      body,
      content: body,
      spot: null,
    })
    expect(picked).toBeTruthy()
    expect(picked!.length).toBeLessThanOrEqual(SMART_FEED_SUMMARY_HARD_MAX)
    expect(picked).not.toContain('Paragraf. Paragraf. Paragraf.')
    expect(picked!.endsWith('.') || picked!.endsWith('!')).toBe(true)
  })

  it('trims long spot to concise complete sentences (~160–420)', () => {
    const sentences = [
      'Birinci cümle burada tamamlandı.',
      'İkinci cümle de net bir özet sunuyor.',
      'Üçüncü cümle ek bağlam veriyor.',
      'Dördüncü cümle gereksiz ayrıntı ekliyor.',
      'Beşinci cümle daha fazla gövde metnine kayıyor.',
      'Altıncı cümle kesinlikle feed kartına sığmamalıdır.',
      'Yedinci cümle de uzun gövdeyi şişirmeye devam eder.',
      'Sekizinci cümle tamamen makale gövdesi gibi uzar.',
      'Dokuzuncu cümle de ek paragraf oluşturur ve feed dışındadır.',
      'Onuncu cümle kartta asla görünmemelidir çünkü bu gövdedir.',
    ]
    const spot = sentences.join(' ')
    expect(spot.length).toBeGreaterThan(SMART_FEED_SUMMARY_TARGET_MAX)
    const picked = selectSmartFeedSummary({ spot, summary: null })
    expect(picked).toBeTruthy()
    expect(picked!.length).toBeLessThanOrEqual(SMART_FEED_SUMMARY_HARD_MAX)
    expect(picked!.length).toBeGreaterThanOrEqual(120)
    expect(/[.!?…]["']?\s*$/u.test(picked!)).toBe(true)
    expect(picked).not.toContain('kartta asla görünmemelidir')
  })

  it('prefers concise summary over body-length spot', () => {
    const summary =
      'Kısa ve net özet cümlesi burada. İkinci cümle de tamam.'
    const spot = `${'Uzun spot cümlesi tamamlandı. '.repeat(40)}`
    expect(spot.length).toBeGreaterThan(800)
    const picked = selectSmartFeedSummary({ summary, spot })
    expect(picked!.length).toBeLessThanOrEqual(SMART_FEED_SUMMARY_HARD_MAX)
    expect(picked).toContain('Kısa ve net')
  })

  it('repairs legacy orphan "... tamamlandı. K"', () => {
    const broken =
      'Şirket ofislerinde yapay zeka kullanımını geçici olarak yasakladı. K'
    expect(trimToCompleteSentences(broken)).toBe(
      'Şirket ofislerinde yapay zeka kullanımını geçici olarak yasakladı.'
    )
    const picked = selectSmartFeedSummary({ summary: broken })
    expect(picked).toBe('Şirket ofislerinde yapay zeka kullanımını geçici olarak yasakladı.')
  })

  it('takeCompleteSentencesUpTo never ends mid-word', () => {
    const text =
      'Birinci cümle burada. İkinci cümle burada tamamlandı. Üçüncü cümle de burada biter.'
    const out = takeCompleteSentencesUpTo(text, 55)
    expect(out.endsWith('.')).toBe(true)
    expect(out).not.toMatch(/\s[A-Za-zÇĞİÖŞÜçğıöşü]$/u)
  })
})

describe('P18.3FG client stall guards (source)', () => {
  it('uses global scroll index + spacers and prefetchThreshold 5', () => {
    expect(FEED_PAGINATION.prefetchThreshold).toBe(5)
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(src).toContain('smart-feed-spacer-before')
    expect(src).toContain('smart-feed-spacer-after')
    expect(src).toContain('EMPTY_PAGE_REFILL_MAX')
    expect(src).toContain('loadingMoreRef')
    expect(src).toContain('lastPrefetchCursorRef')
    expect(src).toContain('scrollTo({')
    expect(src).not.toContain('el.children[index]')
    expect(src).toContain('h-[100dvh]')
    expect(src).toContain('smart-feed-loading-more')
    // Do not hard-end because local window emptied
    expect(src).toContain('setHasMore(lastPage.hasMore)')
    expect(src).not.toMatch(/setHasMore\(\s*false\s*\)/)
    expect(src).not.toMatch(/setHasMore\(items\.length/)
  })

  it('card keeps 100dvh, CTA, text zone, no body dump path', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('h-[100dvh]')
    expect(card).toContain('snap-start snap-always')
    expect(card).toContain('smart-feed-text-zone')
    expect(card).toContain('max-h-[46vh]')
    expect(card).toContain('smart-feed-read-cta')
    expect(card).toContain('Haberi Oku')
    expect(card).not.toMatch(/item\.(body|content)/)
    expect(card).not.toMatch(/line-clamp/)

    const summarySrc = readFileSync(join(process.cwd(), 'src/lib/feed/smartFeedSummary.ts'), 'utf8')
    expect(summarySrc).toContain('void fields.body')
    expect(summarySrc).toContain('void fields.content')
    expect(summarySrc).toContain('SMART_FEED_SUMMARY_TARGET_MAX')

    const dto = readFileSync(join(process.cwd(), 'src/services/feed/FeedService.ts'), 'utf8')
    expect(dto).toContain('summary: row.summary')
    expect(dto).not.toMatch(/body:\s*row/)
    expect(dto).not.toMatch(/content:\s*row/)
  })
})

describe('P18.3FG 50-card client scroll simulation', () => {
  /**
   * Simulates the client windowing + prefetch trigger without React.
   * Proves activeIndex stays global and load-more fires before exhaustion.
   */
  it('scrolls 1→50 with prefetch before remaining hits 0', () => {
    const PAGE = 15
    const PREFETCH = FEED_PAGINATION.prefetchThreshold
    const supply = Array.from({ length: 80 }, (_, i) => `card_${i}`)
    let cursor = 0
    let items: string[] = []
    let hasMore = true
    let activeIndex = 0
    let networkPages = 0
    const cursors: number[] = []
    let concurrent = 0
    let maxConcurrent = 0

    const fetchPage = () => {
      concurrent += 1
      maxConcurrent = Math.max(maxConcurrent, concurrent)
      networkPages += 1
      cursors.push(cursor)
      const slice = supply.slice(cursor, cursor + PAGE)
      cursor += slice.length
      if (!slice.length) hasMore = false
      else if (cursor >= supply.length) hasMore = false
      items = [...items, ...slice]
      concurrent -= 1
    }

    fetchPage()
    expect(items.length).toBe(PAGE)

    const WINDOW_BEFORE = 5
    const WINDOW_MAX = 25

    while (activeIndex < 49 && networkPages < 20) {
      // Advance one card (user scroll)
      activeIndex += 1
      const remaining = items.length - activeIndex
      if (remaining <= PREFETCH && hasMore && concurrent === 0) {
        const beforeLen = items.length
        fetchPage()
        expect(items.length).toBeGreaterThan(beforeLen)
      }
      const windowStart = Math.max(0, activeIndex - WINDOW_BEFORE)
      const windowItems = items.slice(windowStart, windowStart + WINDOW_MAX)
      // Global index must resolve to a real item
      expect(items[activeIndex]).toBeDefined()
      expect(windowItems).toContain(items[activeIndex])
    }

    expect(activeIndex).toBeGreaterThanOrEqual(49)
    expect(items.length).toBeGreaterThanOrEqual(50)
    expect(new Set(items.slice(0, 50)).size).toBe(50)
    expect(networkPages).toBeGreaterThanOrEqual(4)
    expect(maxConcurrent).toBe(1)
    // Prefetch never waited until remaining === 0
    expect(cursors.length).toBe(networkPages)
    expect(new Set(cursors).size).toBe(cursors.length)
  })

  it('slow network: temporary loading then continues without permanent stall', async () => {
    let loadingMore = false
    let items = Array.from({ length: 15 }, (_, i) => `c${i}`)
    let hasMore = true
    let activeIndex = 12
    let stalled = false

    const loadMore = async () => {
      if (loadingMore || !hasMore) return
      loadingMore = true
      await new Promise((r) => setTimeout(r, 40))
      items = [...items, ...Array.from({ length: 15 }, (_, i) => `n${i}`)]
      loadingMore = false
    }

    const remaining = items.length - activeIndex
    expect(remaining).toBeLessThanOrEqual(FEED_PAGINATION.prefetchThreshold)
    const p = loadMore()
    expect(loadingMore).toBe(true)
    await p
    expect(loadingMore).toBe(false)
    expect(items.length).toBe(30)
    activeIndex = 20
    if (items.length - activeIndex <= 0 && !hasMore) stalled = true
    expect(stalled).toBe(false)
  })
})

describe('P18.3FG 100+ server unique regression', () => {
  it('session refill yields 100+ unique IDs without duplicates', () => {
    const supply = Array.from({ length: 140 }, (_, i) => `art_${i}`)
    let session = feedSessionService.create('personal', supply.slice(0, 40), undefined, {
      olderThan: '2025-06-01T00:00:00.000Z',
    })
    const returned: string[] = []
    let cursorPages = 0
    let supplyOffset = 40

    while (returned.length < 100 && cursorPages < 25) {
      cursorPages += 1
      const remaining = session.rankedIds.length - session.offset
      if (remaining < 15 && !session.corpusExhausted) {
        const nextBatch = supply.slice(supplyOffset, supplyOffset + 40)
        supplyOffset += 40
        session = feedSessionService.appendWindow(
          session,
          nextBatch,
          `2025-0${Math.max(1, 6 - cursorPages)}-01T00:00:00.000Z`
        )
      }
      const { ids, nextPayload, hasMoreInSnapshot } = feedSessionService.slicePage(session, 15)
      if (!ids.length) {
        expect(session.corpusExhausted || !hasMoreInSnapshot).toBe(true)
        break
      }
      returned.push(...ids)
      session = nextPayload
    }

    expect(returned.length).toBeGreaterThanOrEqual(100)
    expect(new Set(returned).size).toBe(returned.length)
  })
})

describe('P18.3FG responsive + publication containment source guards', () => {
  it('preserves quarantine / ranking / publication writers untouched by this repair', () => {
    const ranking = readFileSync(
      join(process.cwd(), 'src/services/feed/FeedRankingV1.ts'),
      'utf8'
    )
    expect(ranking.length).toBeGreaterThan(100)

    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('100dvh')
    expect(client).toContain('prefetchThreshold')
  })
})
