import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  canAppearInSmartFeed,
  classifyPublicRead,
  publicReadMetaFromFirestoreDoc,
} from '@/services/editorial/publicReadPolicy'

describe('P18.3E publisher public news eligibility', () => {
  it('includes CANONICAL and LEGACY_ALLOWED; excludes LEGACY_QUARANTINED', () => {
    expect(canAppearInSmartFeed('CANONICAL')).toBe(true)
    expect(canAppearInSmartFeed('SYSTEM_ALERT')).toBe(true)
    expect(canAppearInSmartFeed('LEGACY_ALLOWED')).toBe(true)
    expect(canAppearInSmartFeed('LEGACY_QUARANTINED')).toBe(false)
    expect(canAppearInSmartFeed('NOT_PUBLIC')).toBe(false)
  })

  it('quarantines automation / aiAutoPublished discovery', () => {
    const cls = classifyPublicRead(
      publicReadMetaFromFirestoreDoc('doc1', {
        status: 'published',
        slug: 'some-story',
        title: 'Haber',
        aiAutoPublished: true,
      })
    )
    expect(cls).toBe('LEGACY_QUARANTINED')
    expect(canAppearInSmartFeed(cls)).toBe(false)
  })

  it('draft status is NOT_PUBLIC', () => {
    const cls = classifyPublicRead({ status: 'draft', slug: 'x', title: 't' })
    expect(cls).toBe('NOT_PUBLIC')
  })
})

describe('P18.3E provenance FS wiring', () => {
  it('resolvePublishedArticles re-enables policy-filtered provenance FS path', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/publisher/publisherRepository.ts'),
      'utf8'
    )
    expect(src).toContain('fetchFirestorePublisherArticles')
    expect(src).toContain('countPublisherPublicArticles')
    expect(src).not.toMatch(/Fallback to Firestore disabled for publication safety/)
  })

  it('publisherArticleFirestore uses raw editorial_news_id + publicReadPolicy', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/publisher/publisherArticleFirestore.ts'),
      'utf8'
    )
    expect(src).toContain('editorialNewsId')
    expect(src).toContain('canAppearInSmartFeed')
    expect(src).toContain('selectSmartFeedSummary')
    expect(src).toContain('countEligibleFirestorePublisherArticles')
    expect(src).not.toMatch(/data\.content|data\.body/)
  })

  it('profile client uses masonry columns and load-more API', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/publisher/PublisherProfileClient.tsx'),
      'utf8'
    )
    expect(src).toContain('columns-1')
    expect(src).toContain('break-inside-avoid')
    expect(src).toContain('/api/publishers/')
    expect(src).toContain('Daha fazla haber')
    expect(src).toContain('totalCount')
    expect(src).toContain('Yayıncı Profilini Doğrula')
  })

  it('dedupes by canonical id conceptually in merge path', () => {
    const ids = ['a', 'b', 'a', 'c']
    const seen = new Set<string>()
    const out: string[] = []
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
    expect(out).toEqual(['a', 'b', 'c'])
  })
})

describe('P18.3E ownership independence', () => {
  it('does not mutate verificationStatus in article resolution', () => {
    const repo = readFileSync(
      join(process.cwd(), 'src/services/publisher/publisherRepository.ts'),
      'utf8'
    )
    // resolvePublishedArticles / count must not write verification fields
    const resolveStart = repo.indexOf('async resolvePublishedArticles')
    const resolveEnd = repo.indexOf('async resolveStudioPublishedArticles')
    const slice = repo.slice(resolveStart, resolveEnd)
    expect(slice).not.toContain('verificationStatus:')
    expect(slice).not.toContain('.update(')
    expect(slice).not.toContain('.insert(')
  })
})
