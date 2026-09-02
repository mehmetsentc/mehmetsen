import { describe, expect, it } from 'vitest'
import { buildPostMetadata } from '@/lib/seo'
import type { Post } from '@/types/post'
import {
  canAppearInHomepage,
  canAppearInSearch,
  canAppearInSmartFeed,
  canResolveArticleDetail,
  classifyPublicRead,
  comparePublicReadPriority,
  publicReadMetaFromPost,
  robotsForPublicReadClass,
  tallyPublicReadClasses,
  type PublicReadArticleMeta,
} from './publicReadPolicy'

function postFixture(overrides: Partial<Post> = {}): Post {
  return {
    id: 'p1',
    title: 'Test haber başlığı',
    slug: 'test-haber-basligi',
    content: 'içerik',
    summary: 'özet',
    authorId: 'human1',
    authorUsername: 'human1',
    authorDisplayName: 'Editor',
    authorPhotoURL: null,
    categoryId: 'gundem',
    tags: [],
    postType: 'news',
    mediaItems: [],
    coverImageUrl: null,
    status: 'published',
    visibility: 'public',
    likesCount: 0,
    commentsCount: 0,
    savesCount: 0,
    sharesCount: 0,
    viewsCount: 0,
    isEditorPick: false,
    featured: false,
    localFeatured: false,
    isTrending: false,
    isBreaking: false,
    priorityScore: 0,
    publishedAt: '2026-09-01T12:00:00.000Z',
    createdAt: '2026-09-01T12:00:00.000Z',
    updatedAt: '2026-09-01T12:00:00.000Z',
    ...overrides,
  } as Post
}

describe('P18.3 surface policy — article detail / SEO', () => {
  it('LEGACY_ALLOWED remains indexable with self-canonical', () => {
    const post = postFixture()
    const cls = classifyPublicRead(publicReadMetaFromPost(post))
    expect(cls).toBe('LEGACY_ALLOWED')
    expect(canResolveArticleDetail(cls)).toBe(true)
    const meta = buildPostMetadata(post, {
      robotsOverride: robotsForPublicReadClass(cls),
    })
    expect(meta.robots).toMatchObject({ index: true, follow: true })
    expect(meta.alternates).toMatchObject({ canonical: expect.any(String) })
  })

  it('LEGACY_QUARANTINED readable + noindex,follow + self-canonical', () => {
    const post = postFixture({ aiAutoPublished: true })
    const cls = classifyPublicRead(publicReadMetaFromPost(post))
    expect(cls).toBe('LEGACY_QUARANTINED')
    expect(canResolveArticleDetail(cls)).toBe(true)
    const meta = buildPostMetadata(post, {
      robotsOverride: robotsForPublicReadClass(cls),
    })
    expect(meta.robots).toMatchObject({ index: false, follow: true })
    expect(meta.alternates).toMatchObject({ canonical: expect.any(String) })
  })

  it('NOT_PUBLIC is not resolvable', () => {
    const post = postFixture({ status: 'draft' })
    const cls = classifyPublicRead(publicReadMetaFromPost(post))
    expect(cls).toBe('NOT_PUBLIC')
    expect(canResolveArticleDetail(cls)).toBe(false)
  })

  it('CANONICAL PG marker stays indexable', () => {
    const post = postFixture({ fromCanonicalPg: true })
    const cls = classifyPublicRead(publicReadMetaFromPost(post))
    expect(cls).toBe('CANONICAL')
    const meta = buildPostMetadata(post, {
      robotsOverride: robotsForPublicReadClass(cls),
    })
    expect(meta.robots).toMatchObject({ index: true, follow: true })
  })
})

describe('P18.3 surface policy — homepage / search / smart feed', () => {
  it('prefer canonical over legacy in sort', () => {
    const a: PublicReadArticleMeta = {
      id: '1',
      status: 'published',
      slug: 'a',
      title: 'a',
    }
    const b: PublicReadArticleMeta = {
      id: '2',
      status: 'published',
      slug: 'b',
      title: 'b',
      publicationAuthority: 'HUMAN_EDITOR',
    }
    expect(comparePublicReadPriority(b, a)).toBeLessThan(0)
  })

  it('quarantined excluded from homepage/search/smart-feed', () => {
    const cls = classifyPublicRead({
      id: 'x',
      status: 'published',
      slug: 'x-slug',
      title: 'x',
      aiAutoPublished: true,
    })
    expect(canAppearInHomepage(cls)).toBe(false)
    expect(canAppearInSearch(cls)).toBe(false)
    expect(canAppearInSmartFeed(cls)).toBe(false)
  })

  it('legacy allowed remains eligible for continuity surfaces', () => {
    const cls = classifyPublicRead({
      id: 'x',
      status: 'published',
      slug: 'x-slug',
      title: 'x',
    })
    expect(canAppearInHomepage(cls)).toBe(true)
    expect(canAppearInSearch(cls)).toBe(true)
    expect(canAppearInSmartFeed(cls)).toBe(true)
  })
})

describe('P18.3 pre-deploy blast-radius estimate (P18.2-shaped)', () => {
  /**
   * Read-time simulation only — no Firestore writes.
   * Uses P18.2 provenance proportions on a synthetic published corpus.
   */
  it('quarantine stays well under 50% of discovery candidates', () => {
    const metas: PublicReadArticleMeta[] = []
    // Proportional mini-corpus (~1% of P18.2 published): 1 HUMAN, 12 automation, 389 unknown
    for (let i = 0; i < 1; i++) {
      metas.push({
        id: `h${i}`,
        status: 'published',
        slug: `human-${i}`,
        title: `Human ${i}`,
        publicationAuthority: 'HUMAN_EDITOR',
        publishedBy: `editor_${i}`,
      })
    }
    for (let i = 0; i < 12; i++) {
      metas.push({
        id: `a${i}`,
        status: 'published',
        slug: `auto-${i}`,
        title: `Auto ${i}`,
        authorId: 'ap3scBglLIVwflfZN4qL8PKrM1A3',
      })
    }
    for (let i = 0; i < 389; i++) {
      metas.push({
        id: `u${i}`,
        status: 'published',
        slug: `unknown-${i}`,
        title: `Unknown ${i}`,
      })
    }

    const counts = tallyPublicReadClasses(metas)
    const discoveryEligible =
      counts.CANONICAL + counts.SYSTEM_ALERT + counts.LEGACY_ALLOWED
    const discoveryBefore = metas.length
    const removalRate = 1 - discoveryEligible / discoveryBefore

    expect(counts.CANONICAL).toBe(1)
    expect(counts.LEGACY_QUARANTINED).toBe(12)
    expect(counts.LEGACY_ALLOWED).toBe(389)
    expect(removalRate).toBeLessThan(0.05)
    expect(removalRate).toBeLessThan(0.5)
  })

  it('full P18.2 ratio estimate: quarantine ~2.9%', () => {
    const total = 40245
    const human = 100
    const automation = 1154
    const unknown = total - human - automation
    const quarantined = automation
    const allowed = unknown
    const removal = quarantined / total
    expect(allowed + human + quarantined).toBe(total)
    expect(removal).toBeLessThan(0.05)
    expect(removal).toBeLessThan(0.5)
  })
})
