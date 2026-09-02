import { describe, expect, it } from 'vitest'
import {
  canAppearInHomepage,
  canAppearInImageSitemap,
  canAppearInNewsSitemap,
  canAppearInSearch,
  canAppearInSmartFeed,
  canAppearInVideoSitemap,
  canBeIndexable,
  canResolveArticleDetail,
  classifyPublicRead,
  publicReadMetaFromFirestoreDoc,
  robotsForPublicReadClass,
  shouldEmitSelfCanonical,
  type PublicReadArticleMeta,
} from './publicReadPolicy'

function basePublished(overrides: Partial<PublicReadArticleMeta> = {}): PublicReadArticleMeta {
  return {
    id: 'art_1',
    title: 'Normal haber',
    status: 'published',
    slug: 'normal-haber',
    visibility: 'public',
    ...overrides,
  }
}

describe('P18.3 publicReadPolicy classifier', () => {
  it('published HUMAN_EDITOR → CANONICAL', () => {
    expect(
      classifyPublicRead(
        basePublished({ publicationAuthority: 'HUMAN_EDITOR', publishedBy: 'human_uid_1' })
      )
    ).toBe('CANONICAL')
  })

  it('published SYSTEM_ALERT → SYSTEM_ALERT', () => {
    expect(
      classifyPublicRead(basePublished({ publicationAuthority: 'SYSTEM_ALERT' }))
    ).toBe('SYSTEM_ALERT')
  })

  it('PG canonical published without authority field → CANONICAL', () => {
    expect(classifyPublicRead(basePublished({ fromCanonicalPg: true }))).toBe('CANONICAL')
  })

  it('published legacy normal → LEGACY_ALLOWED', () => {
    expect(classifyPublicRead(basePublished())).toBe('LEGACY_ALLOWED')
  })

  it('does NOT infer HUMAN_EDITOR from authorId alone', () => {
    expect(
      classifyPublicRead(basePublished({ authorId: 'some_human_looking_uid' }))
    ).toBe('LEGACY_ALLOWED')
  })

  it('known automation historical → LEGACY_QUARANTINED', () => {
    expect(
      classifyPublicRead(
        basePublished({ authorId: 'ap3scBglLIVwflfZN4qL8PKrM1A3' })
      )
    ).toBe('LEGACY_QUARANTINED')
    expect(
      classifyPublicRead(basePublished({ publishedBy: 'crawler_bot' }))
    ).toBe('LEGACY_QUARANTINED')
  })

  it('aiAutoPublished historical → LEGACY_QUARANTINED', () => {
    expect(classifyPublicRead(basePublished({ aiAutoPublished: true }))).toBe(
      'LEGACY_QUARANTINED'
    )
  })

  it('needsReview historical → LEGACY_QUARANTINED', () => {
    expect(classifyPublicRead(basePublished({ needsReview: true }))).toBe(
      'LEGACY_QUARANTINED'
    )
  })

  it('draft → NOT_PUBLIC', () => {
    expect(classifyPublicRead(basePublished({ status: 'draft' }))).toBe('NOT_PUBLIC')
  })

  it('archived → NOT_PUBLIC', () => {
    expect(classifyPublicRead(basePublished({ status: 'archived' }))).toBe('NOT_PUBLIC')
  })

  it('private/test/noindex → LEGACY_QUARANTINED when published', () => {
    expect(classifyPublicRead(basePublished({ visibility: 'private' }))).toBe(
      'LEGACY_QUARANTINED'
    )
    expect(classifyPublicRead(basePublished({ seoNoindex: true }))).toBe(
      'LEGACY_QUARANTINED'
    )
    expect(
      classifyPublicRead(basePublished({ publisherType: 'INTERNAL_TEST' }))
    ).toBe('LEGACY_QUARANTINED')
    expect(classifyPublicRead(basePublished({ id: 'test_abc', slug: 'x' }))).toBe(
      'LEGACY_QUARANTINED'
    )
  })

  it('missing / id-only slug → LEGACY_QUARANTINED (not active discovery)', () => {
    expect(classifyPublicRead(basePublished({ slug: '' }))).toBe('LEGACY_QUARANTINED')
    expect(classifyPublicRead(basePublished({ id: 'abc', slug: 'abc' }))).toBe(
      'LEGACY_QUARANTINED'
    )
    expect(classifyPublicRead(basePublished({ slug: 'taslak-xyz' }))).toBe(
      'LEGACY_QUARANTINED'
    )
  })

  it('surface helpers match staged containment', () => {
    expect(canAppearInHomepage('CANONICAL')).toBe(true)
    expect(canAppearInHomepage('SYSTEM_ALERT')).toBe(true)
    expect(canAppearInHomepage('LEGACY_ALLOWED')).toBe(true)
    expect(canAppearInHomepage('LEGACY_QUARANTINED')).toBe(false)
    expect(canAppearInHomepage('NOT_PUBLIC')).toBe(false)

    expect(canAppearInSmartFeed('LEGACY_QUARANTINED')).toBe(false)
    expect(canAppearInSearch('LEGACY_ALLOWED')).toBe(true)
    expect(canAppearInSearch('LEGACY_QUARANTINED')).toBe(false)

    expect(canAppearInNewsSitemap('CANONICAL')).toBe(true)
    expect(canAppearInNewsSitemap('SYSTEM_ALERT')).toBe(true)
    expect(canAppearInNewsSitemap('LEGACY_ALLOWED')).toBe(false)
    expect(canAppearInNewsSitemap('LEGACY_QUARANTINED')).toBe(false)

    expect(canAppearInImageSitemap('LEGACY_ALLOWED')).toBe(true)
    expect(canAppearInImageSitemap('LEGACY_QUARANTINED')).toBe(false)
    expect(canAppearInVideoSitemap('LEGACY_QUARANTINED')).toBe(false)

    expect(canResolveArticleDetail('LEGACY_QUARANTINED')).toBe(true)
    expect(canResolveArticleDetail('NOT_PUBLIC')).toBe(false)

    expect(canBeIndexable('LEGACY_ALLOWED')).toBe(true)
    expect(canBeIndexable('LEGACY_QUARANTINED')).toBe(false)
    expect(robotsForPublicReadClass('LEGACY_QUARANTINED')).toEqual({
      index: false,
      follow: true,
    })
    expect(shouldEmitSelfCanonical('LEGACY_QUARANTINED')).toBe(true)
  })

  it('publicReadMetaFromFirestoreDoc maps provenance fields', () => {
    const meta = publicReadMetaFromFirestoreDoc('id1', {
      title: 't',
      status: 'published',
      slug: 't-slug',
      publicationAuthority: 'HUMAN_EDITOR',
      publishedBy: 'u1',
      aiAutoPublished: false,
    })
    expect(classifyPublicRead(meta)).toBe('CANONICAL')
  })
})
