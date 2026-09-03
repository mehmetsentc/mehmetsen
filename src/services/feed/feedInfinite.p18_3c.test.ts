import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  looksTruncatedMidWord,
  selectSmartFeedSummary,
  trimToCompleteSentences,
} from '@/lib/feed/smartFeedSummary'
import { feedSessionService } from '@/services/feed/FeedSessionService'

describe('P18.3C smart feed summary selection', () => {
  it('trims orphan trailing fragment (... yasakladı. K)', () => {
    const raw =
      'Şirket, ofislerinde yapay zeka kullanımını geçici olarak yasakladı. K'
    expect(looksTruncatedMidWord(raw)).toBe(true)
    expect(trimToCompleteSentences(raw)).toBe(
      'Şirket, ofislerinde yapay zeka kullanımını geçici olarak yasakladı.'
    )
  })

  it('prefers complete spot over mid-word 200-char summary', () => {
    let cut200 = 'Enerji yatırımlarının güçlendirilmesi ile enerji alanındaki gelişmeler sürmekteyken piyasal'
    while (cut200.length < 200) cut200 += 'a'
    cut200 = cut200.slice(0, 200)
    expect(cut200).toHaveLength(200)
    expect(looksTruncatedMidWord(cut200)).toBe(true)
    const spot =
      'Enerji yatırımlarının güçlendirilmesi ile enerji alanındaki işbirliği artacak. Anlaşma imzalandı.'
    const picked = selectSmartFeedSummary({ summary: cut200, spot })
    expect(picked).toContain('Anlaşma imzalandı')
    expect(picked!.endsWith('imzalandı.')).toBe(true)
  })

  it('does not invent text — returns complete stored paragraph', () => {
    const spot = 'Tam paragraf. İkinci cümle de burada.'
    expect(selectSmartFeedSummary({ summary: null, spot })).toBe(spot)
  })
})

describe('P18.3C session multi-window append', () => {
  it('appends new window without replaying prior IDs', () => {
    const session = feedSessionService.create('personal', ['a1', 'a2', 'a3'])
    const next = feedSessionService.appendWindow(session, ['a3', 'a4', 'a5'], '2024-01-01T00:00:00.000Z')
    expect(next.rankedIds).toEqual(['a1', 'a2', 'a3', 'a4', 'a5'])
    expect(next.generation).toBe(1)
    expect(next.corpusExhausted).toBe(false)
    expect(next.olderThan).toBe('2024-01-01T00:00:00.000Z')
  })

  it('marks corpus exhausted when refill yields nothing new', () => {
    const session = feedSessionService.create('personal', ['a1', 'a2'])
    const next = feedSessionService.appendWindow(session, ['a1', 'a2'])
    expect(next.corpusExhausted).toBe(true)
    expect(next.rankedIds).toEqual(['a1', 'a2'])
  })

  it('paginates across appended windows without duplicate pages', () => {
    let session = feedSessionService.create('personal', Array.from({ length: 10 }, (_, i) => `id_${i}`))
    const seen = new Set<string>()
    for (let page = 0; page < 3; page++) {
      const { ids, nextPayload, hasMoreInSnapshot } = feedSessionService.slicePage(session, 5)
      if (!hasMoreInSnapshot && page < 2) {
        session = feedSessionService.appendWindow(
          nextPayload,
          Array.from({ length: 10 }, (_, i) => `id_${page + 1}_${i}`)
        )
        continue
      }
      for (const id of ids) {
        expect(seen.has(id)).toBe(false)
        seen.add(id)
      }
      session = nextPayload
    }
    expect(seen.size).toBeGreaterThanOrEqual(10)
  })
})

describe('P18.3C 100-card unique pagination simulation', () => {
  it('simulates 100 unique cards across refill windows', () => {
    const supply = Array.from({ length: 120 }, (_, i) => `art_${i}`)
    let session = feedSessionService.create('personal', supply.slice(0, 40), undefined, {
      olderThan: '2025-06-01T00:00:00.000Z',
    })
    const returned: string[] = []
    let cursorPages = 0
    let supplyOffset = 40

    while (returned.length < 100 && cursorPages < 20) {
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
    expect(cursorPages).toBeGreaterThan(3)
  })
})

describe('P18.3C card + containment source guards', () => {
  it('summary uses presentation clamp only — no slice / nested scroll trap', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(src).toContain('data-testid="smart-feed-summary"')
    expect(src).toContain('line-clamp-2')
    expect(src).not.toMatch(/item\.summary\.slice|item\.summary\.substring/)
    expect(src).toContain('orientation="vertical"')
    expect(src).toContain('object-cover')
    expect(src).toContain('blur-2xl')
  })

  it('pipeline refills session windows instead of ending on first snapshot', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/feed/FeedRankingPipeline.ts'),
      'utf8'
    )
    expect(src).toContain('appendWindow')
    expect(src).toContain('fetchOlderLegacyAllowed')
    expect(src).toContain('buildNextWindow')
    expect(src).toContain('corpusExhausted')
  })

  it('candidate service exposes older LEGACY_ALLOWED window', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/feed/FeedCandidateService.ts'),
      'utf8'
    )
    expect(src).toContain('fetchOlderLegacyAllowed')
    expect(src).toContain('selectSmartFeedSummary')
    expect(src).toContain('canAppearInSmartFeed')
  })

  it('seen identities expand across PG/legacy/slug', () => {
    const src = readFileSync(join(process.cwd(), 'src/services/feed/FeedSeenService.ts'), 'utf8')
    expect(src).toContain('expandArticleIdentities')
    expect(src).toContain('legacyFirestoreId')
  })
})

describe('P18.3C refresh seen suppression fixture', () => {
  it('guest seen filter keeps A/B/C out and allows D/E/F', async () => {
    const localMap = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => localMap.get(k) ?? null,
      setItem: (k: string, v: string) => localMap.set(k, v),
      removeItem: (k: string) => localMap.delete(k),
    })
    vi.stubGlobal('sessionStorage', {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    })
    vi.stubGlobal('window', { localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage })

    const { readGuestSeen, writeGuestSeen } = await import('@/lib/feed/feedSeenClient')
    writeGuestSeen(new Set(['A', 'B', 'C', 'slug-a']))
    const seen = readGuestSeen()
    const page = [
      { articleId: 'A', slug: 'slug-a' },
      { articleId: 'B', slug: 'b' },
      { articleId: 'D', slug: 'd' },
      { articleId: 'E', slug: 'e' },
      { articleId: 'F', slug: 'f' },
    ]
    const visible = page.filter((i) => !seen.has(i.articleId) && !(i.slug && seen.has(i.slug)))
    expect(visible.map((v) => v.articleId)).toEqual(['D', 'E', 'F'])
    vi.unstubAllGlobals()
  })
})
