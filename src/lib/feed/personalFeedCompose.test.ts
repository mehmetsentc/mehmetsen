import { describe, expect, it } from 'vitest'
import { shapePersonalInventory } from '@/lib/feed/personalFeedCompose'
import { feedDiversityEngine } from '@/services/feed/FeedDiversityEngine'
import { feedScoringService } from '@/services/feed/FeedScoringService'
import type { FeedCandidateRow, FeedUserContext, ScoredFeedCandidate } from '@/types/smartFeed'

const NOW = new Date('2026-10-01T00:00:00.000Z')

function row(partial: Partial<FeedCandidateRow> & Pick<FeedCandidateRow, 'articleId'>): FeedCandidateRow {
  return {
    clusterId: null,
    publisherId: null,
    publisherSlug: null,
    publisherName: null,
    publisherLogoUrl: null,
    headline: partial.headline ?? 'Test',
    summary: null,
    category: null,
    image: null,
    video: null,
    publishedAt: partial.publishedAt ?? NOW,
    updatedAt: NOW,
    breaking: false,
    materialUpdate: false,
    clusterSourceCount: 1,
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    slug: partial.slug ?? partial.articleId,
    source: partial.source ?? 'RECENT',
    sortScore: NOW.getTime(),
    ...partial,
  }
}

function ctx(): FeedUserContext {
  return {
    userId: 'u1',
    isSynthetic: false,
    explicitInterests: [],
    behavioralInterests: new Map(),
    publisherAffinities: new Map(),
    followedPublisherIds: new Set(),
    negativePreferences: [],
    city: 'antalya',
    districtSlug: null,
  }
}

describe('Sana Özel unseen national spine', () => {
  it('drops stale local the reader already passed and keeps newest national', () => {
    const shaped = shapePersonalInventory(
      [
        row({
          articleId: 'old-fire',
          category: 'yerel-haber',
          source: 'LOCAL',
          citySlug: 'antalya',
          publishedAt: new Date(NOW.getTime() - 21 * 24 * 60 * 60 * 1000),
        }),
        row({
          articleId: 'old-fire-2',
          category: 'yerel-asayis',
          source: 'LOCAL',
          citySlug: 'antalya',
          publishedAt: new Date(NOW.getTime() - 18 * 24 * 60 * 60 * 1000),
        }),
        row({
          articleId: 'gundem-older',
          category: 'gundem',
          source: 'RECENT',
          publishedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
        }),
        row({
          articleId: 'gundem-new',
          category: 'gundem',
          source: 'RECENT',
          publishedAt: new Date(NOW.getTime() - 30 * 60 * 1000),
        }),
        row({
          articleId: 'fresh-local',
          category: 'yerel-gundem',
          source: 'LOCAL',
          citySlug: 'antalya',
          publishedAt: new Date(NOW.getTime() - 60 * 60 * 1000),
        }),
      ],
      NOW.getTime()
    )
    expect(shaped.map((row) => row.articleId)).toEqual(['gundem-new', 'gundem-older'])
  })

  it('keeps one fresh local once several unseen national cards are available', () => {
    const national = [1, 2, 3, 4].map((n) =>
      row({
        articleId: `n${n}`,
        category: 'gundem',
        publishedAt: new Date(NOW.getTime() - n * 60 * 60 * 1000),
      })
    )
    const shaped = shapePersonalInventory(
      [
        ...national,
        row({
          articleId: 'local-fresh',
          category: 'yerel-haber',
          source: 'LOCAL',
          citySlug: 'antalya',
          publishedAt: new Date(NOW.getTime() - 2 * 60 * 60 * 1000),
        }),
      ],
      NOW.getTime()
    )
    expect(shaped.map((row) => row.articleId)).toEqual(['n1', 'n2', 'n3', 'n4', 'local-fresh'])
  })

  it('does not run yerel-haber, yerel-asayis, and yerel-gundem back to back', () => {
    const scored: ScoredFeedCandidate[] = [
      row({ articleId: 'l1', category: 'yerel-haber', source: 'LOCAL', citySlug: 'antalya' }),
      row({ articleId: 'l2', category: 'yerel-asayis', source: 'LOCAL', citySlug: 'antalya' }),
      row({ articleId: 'l3', category: 'yerel-gundem', source: 'LOCAL', citySlug: 'antalya' }),
      row({ articleId: 'n1', category: 'gundem', source: 'RECENT' }),
    ].map((candidate, index) => {
      const scoredRow = feedScoringService.scoreCandidate(candidate, ctx(), 'personal')
      scoredRow.score = index < 3 ? 0.95 : 0.7
      return scoredRow
    })
    const ranked = feedDiversityEngine.rerank(scored, 'personal', 4)
    const families = ranked.map((item) => (item.category ?? '').startsWith('yerel') ? 'yerel' : item.category)
    expect(families.slice(0, 3)).not.toEqual(['yerel', 'yerel', 'yerel'])
    expect(ranked.some((item) => item.articleId === 'n1')).toBe(true)
  })

  it('drops a local story the user already opened', () => {
    const scored = feedScoringService.scoreAll(
      [
        row({ articleId: 'seen-local', category: 'yerel-haber', source: 'LOCAL', citySlug: 'antalya' }),
        row({ articleId: 'fresh-national', category: 'gundem', source: 'RECENT' }),
      ],
      ctx(),
      'personal',
      new Set(['seen-local']),
      new Set()
    )
    expect(scored.map((item) => item.articleId)).toEqual(['fresh-national'])
  })
})
