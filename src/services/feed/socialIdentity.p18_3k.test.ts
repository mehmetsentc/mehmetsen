import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P18.3K — Social identity final closure for LEGACY_ALLOWED Firestore-only cards.
 * No Production engagement mutations.
 */

describe('P18.3K identity source contracts', () => {
  it('resolver supports PG then exact Firestore Smart Feed-eligible fallback', () => {
    const id = readFileSync(
      join(process.cwd(), 'src/services/social/socialArticleIdentity.ts'),
      'utf8'
    )
    expect(id).toContain('resolveSocialArticleIdentity')
    expect(id).toContain('canAppearInSmartFeed')
    expect(id).toContain('classifyPublicRead')
    expect(id).toContain('publicReadMetaFromFirestoreDoc')
    expect(id).toContain("collection(Collections.NEWS).doc(key)")
    expect(id).not.toMatch(/where\('slug'/)
    expect(id).not.toContain('ensurePublishedNewsMirror')
  })

  it('repository uses social identity + soft news counters', () => {
    const repo = readFileSync(
      join(process.cwd(), 'src/services/social/socialGraphRepository.ts'),
      'utf8'
    )
    expect(repo).toContain('resolveSocialArticleIdentity')
    expect(repo).toContain('bumpNewsCounter')
    expect(repo).toContain('countSocialEngagement')
    expect(repo).toContain('tryResolvePgArticleId')
    expect(repo).toMatch(/originalToCanonical\.set\(id, pgId \?\? id\)/)
    expect(repo).toContain('recordShare')
  })

  it('migration drops news FKs without creating news rows', () => {
    const sql = readFileSync(
      join(process.cwd(), 'src/db/migrations/0037_phase_p18_3k_social_legacy_identity.sql'),
      'utf8'
    )
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "article_likes_article_id_news_fk"')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "saved_articles_article_id_news_fk"')
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS "article_comments_article_id_news_fk"')
    expect(sql).not.toMatch(/INSERT INTO\s+"news"/i)
    expect(sql).not.toMatch(/CREATE TABLE/i)

    const schema = readFileSync(join(process.cwd(), 'src/db/schema/socialGraph.ts'), 'utf8')
    expect(schema).not.toMatch(/articleId:[\s\S]*references\(\(\) => news\.id/)
  })

  it('UI keeps distinguishable ARTICLE_NOT_FOUND vs AUTH_REQUIRED toasts', () => {
    const sheet = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/CommentsBottomSheet.tsx'),
      'utf8'
    )
    expect(sheet).toContain("msg === 'ARTICLE_NOT_FOUND'")
    expect(sheet).toContain('Bu haber için yorum şu an kaydedilemiyor.')
    expect(sheet).toContain("msg === 'AUTH_REQUIRED'")
    expect(sheet).toContain('z-[120]')
    expect(sheet).toContain('Yorumu gönder')

    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('ARTICLE_NOT_FOUND')
    expect(client).toContain('ensureAuthReady')
  })

  it('share telemetry soft-fails; comments log safe diagnostics', () => {
    const share = readFileSync(
      join(process.cwd(), 'src/app/api/social/article/share/route.ts'),
      'utf8'
    )
    expect(share).toContain("ok: true")
    expect(share).toContain('telemetry')

    const comments = readFileSync(
      join(process.cwd(), 'src/app/api/social/comments/route.ts'),
      'utf8'
    )
    expect(comments).toContain('[social.comments]')
    expect(comments).toContain('articleKeyLen')
    expect(comments).not.toContain('Bearer')
    expect(comments).not.toContain('getIdToken')
  })
})

describe('P18.3K resolveSocialArticleIdentity unit', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  it('returns PG news.id when mirror exists', async () => {
    vi.doMock('@/lib/firebase/admin', () => ({
      getAdminFirestore: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false }),
          }),
        }),
      }),
    }))
    const { resolveSocialArticleIdentity } = await import('@/services/social/socialArticleIdentity')
    const resolved = await resolveSocialArticleIdentity('fs_legacy_1', {
      lookupPg: async () => ({ id: 'pg_news_1', legacyFirestoreId: 'fs_legacy_1' }),
    })
    expect(resolved).toEqual({
      socialArticleId: 'pg_news_1',
      kind: 'pg_news',
      newsId: 'pg_news_1',
      firestoreId: 'fs_legacy_1',
    })
  })

  it('returns Firestore doc id for LEGACY_ALLOWED without PG row', async () => {
    vi.doMock('@/lib/firebase/admin', () => ({
      getAdminFirestore: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              id: 'fs_only_abc',
              data: () => ({
                status: 'published',
                slug: 'kaburga-misir-tarifi',
                title: 'Kaburga Mısır',
              }),
            }),
          }),
        }),
      }),
    }))
    const { resolveSocialArticleIdentity } = await import('@/services/social/socialArticleIdentity')
    const resolved = await resolveSocialArticleIdentity('fs_only_abc', {
      lookupPg: async () => null,
    })
    expect(resolved.kind).toBe('firestore_legacy')
    expect(resolved.socialArticleId).toBe('fs_only_abc')
    expect(resolved.newsId).toBeNull()
  })

  it('rejects LEGACY_QUARANTINED Firestore docs', async () => {
    vi.doMock('@/lib/firebase/admin', () => ({
      getAdminFirestore: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({
              exists: true,
              id: 'fs_quar',
              data: () => ({
                status: 'published',
                slug: 'taslak-xyz',
                title: 'Quarantined',
                aiAutoPublished: true,
              }),
            }),
          }),
        }),
      }),
    }))
    const { resolveSocialArticleIdentity } = await import('@/services/social/socialArticleIdentity')
    await expect(
      resolveSocialArticleIdentity('fs_quar', { lookupPg: async () => null })
    ).rejects.toThrow('ARTICLE_NOT_FOUND')
  })

  it('rejects missing Firestore docs', async () => {
    vi.doMock('@/lib/firebase/admin', () => ({
      getAdminFirestore: () => ({
        collection: () => ({
          doc: () => ({
            get: async () => ({ exists: false }),
          }),
        }),
      }),
    }))
    const { resolveSocialArticleIdentity } = await import('@/services/social/socialArticleIdentity')
    await expect(
      resolveSocialArticleIdentity('missing_doc', { lookupPg: async () => null })
    ).rejects.toThrow('ARTICLE_NOT_FOUND')
  })
})

describe('P18.3K comments sheet regression guards', () => {
  it('preserves P18.3J viewport / z-index / MobileNav hide contract', () => {
    const sheet = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/CommentsBottomSheet.tsx'),
      'utf8'
    )
    expect(sheet).toContain('z-[120]')
    expect(sheet).toContain('min-h-0')
    expect(sheet).toContain('visualViewport')
    expect(sheet).toContain('smart-feed-comments-open')

    const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf8')
    expect(css).toContain('smart-feed-comments-open')
    expect(css).toContain('.mobile-bottom-nav')
  })
})
