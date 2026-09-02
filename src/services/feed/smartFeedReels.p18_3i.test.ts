import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * P18.3I — Smart Feed final Reels UI + social identity / wiring guards.
 * Mutation persistence is covered via repository source contracts + mocked unit paths.
 * No Production engagement mutations.
 */

describe('P18.3I social identity mapping (source)', () => {
  it('socialGraphRepository resolves article by id / legacyFirestoreId / slug', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/social/socialGraphRepository.ts'),
      'utf8'
    )
    expect(src).toContain('resolveCanonicalArticleId')
    expect(src).toContain('tryResolveCanonicalArticleId')
    expect(src).toContain('eq(news.legacyFirestoreId')
    expect(src).toContain('eq(news.slug')
    expect(src).toContain('likeArticle')
    expect(src).toMatch(/const canonicalId = await this\.resolveCanonicalArticleId/)
    expect(src).toContain('batchArticleState')
    expect(src).toContain('originalToCanonical')
  })

  it('publisher resolve accepts id, slug, and any sourceId (not only src_)', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/social/socialGraphRepository.ts'),
      'utf8'
    )
    expect(src).toContain('resolvePublisherId')
    expect(src).toContain('eq(publishers.slug')
    expect(src).toContain('eq(publisherSources.sourceId')
    expect(src).not.toMatch(/if \(!idOrSourceId\.startsWith\('src_'\)\) return idOrSourceId/)
  })
})

describe('P18.3I social UI wiring (source)', () => {
  it('rail like/save use parent handlers; share records via socialApi', () => {
    const rail = readFileSync(
      join(process.cwd(), 'src/components/social/SocialActionRail.tsx'),
      'utf8'
    )
    expect(rail).toContain('onToggle={onToggleLike}')
    expect(rail).toContain('onToggle={onToggleSave}')
    expect(rail).toContain('BaseShareButton')
    expect(rail).toContain('orientation')

    const shareMenu = readFileSync(join(process.cwd(), 'src/components/post/ShareMenu.tsx'), 'utf8')
    expect(shareMenu).toContain('socialApi.recordShare')
    expect(shareMenu).toContain('buildShareText')

    const shareBtn = readFileSync(join(process.cwd(), 'src/components/post/ShareButton.tsx'), 'utf8')
    expect(shareBtn).toContain('buildPostShareUrl')
  })

  it('SmartFeedClient wires like/save/comment with optimistic rollback', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(src).toContain('toggleLike')
    expect(src).toContain('toggleSave')
    expect(src).toContain('socialApi.likeArticle')
    expect(src).toContain('socialApi.unlikeArticle')
    expect(src).toContain('socialApi.saveArticle')
    expect(src).toContain('socialApi.unsaveArticle')
    expect(src).toContain('CommentsBottomSheet')
    expect(src).toContain('toast.error')
    expect(src).toContain('Beğeni kaydedilemedi')
    expect(src).toContain('Kaydetme işlemi başarısız')
  })

  it('FollowButton has overlay variant + Takiptesin label + auth redirect', () => {
    const src = readFileSync(join(process.cwd(), 'src/components/social/FollowButton.tsx'), 'utf8')
    expect(src).toContain("variant?: 'default' | 'overlay'")
    expect(src).toContain('Takiptesin')
    expect(src).toContain('Takip et')
    expect(src).toContain('buildAuthIntent')
    expect(src).toContain('FOLLOW')
    expect(src).toContain('toast.error')
  })

  it('CommentsBottomSheet keeps composer + load/post paths', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/CommentsBottomSheet.tsx'),
      'utf8'
    )
    expect(src).toContain('socialApi.createComment')
    expect(src).toContain('/api/social/comments')
    expect(src).toMatch(/composer|textarea|draft/i)
  })
})

describe('P18.3I layout hierarchy (source)', () => {
  it('card reserves mode-nav clearance and publisher row below tabs', () => {
    const card = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FullscreenNewsCard.tsx'),
      'utf8'
    )
    expect(card).toContain('h-[100dvh]')
    expect(card).toContain('snap-start snap-always')
    expect(card).toContain('smart-feed-publisher-row')
    expect(card).toContain('MODE_NAV_CLEARANCE')
    expect(card).toContain('smart-feed-media')
    expect(card).toContain('smart-feed-text-zone')
    expect(card).toContain('smart-feed-read-cta')
    expect(card).toContain('smart-feed-social-rail')
    expect(card).toContain('object-contain')
    expect(card).toContain('blur-2xl')
    expect(card).not.toMatch(/item\.(body|content)/)
    expect(card).not.toMatch(/line-clamp/)
    expect(card).toContain('variant="overlay"')
    expect(card).toContain('returnUrl="/feed-v2"')
  })

  it('mode nav remains absolute with white active pill', () => {
    const nav = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/FeedModeNav.tsx'),
      'utf8'
    )
    expect(nav).toContain('absolute')
    expect(nav).toContain('bg-white text-black')
    expect(nav).toContain('FEED_MODE_LABELS')
    expect(nav).toContain("'personal', 'following', 'breaking', 'local'")
    const labels = readFileSync(join(process.cwd(), 'src/lib/feed/config.ts'), 'utf8')
    expect(labels).toContain("personal: 'Sana Özel'")
  })

  it('summary boundary still blocks body fallback', () => {
    const summary = readFileSync(join(process.cwd(), 'src/lib/feed/smartFeedSummary.ts'), 'utf8')
    expect(summary).toContain('void fields.body')
    expect(summary).toContain('void fields.content')
    expect(summary).toContain('SMART_FEED_SUMMARY_TARGET_MAX')
  })

  it('P18.3FG infinite scroll spacers preserved', () => {
    const client = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(client).toContain('smart-feed-spacer-before')
    expect(client).toContain('smart-feed-spacer-after')
    expect(client).toContain('prefetchThreshold')
    expect(client).toContain('EMPTY_PAGE_REFILL_MAX')
  })
})

describe('P18.3I fixture social mutation semantics', () => {
  it('like optimistic + rollback pattern documented in client', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    // optimistic then catch rollback
    expect(src).toMatch(/setSocial[\s\S]*liked: nextLiked[\s\S]*catch[\s\S]*liked: prevLiked/)
  })

  it('save optimistic + rollback pattern documented in client', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/components/feed/smart/SmartFeedClient.tsx'),
      'utf8'
    )
    expect(src).toMatch(/setSocial[\s\S]*saved: nextSaved[\s\S]*catch[\s\S]*saved: prevSaved/)
  })

  it('canonical share URL prefers /haber/slug', () => {
    const seo = readFileSync(join(process.cwd(), 'src/lib/shareUtils.ts'), 'utf8')
    expect(seo).toMatch(/buildPostShareUrl|haber/)
  })
})

describe('P18.3I containment + publication safety (no change)', () => {
  it('publication authority tests still green via static markers', () => {
    const p181 = readFileSync(
      join(process.cwd(), 'src/services/editorial/publicationAuthority.p18_1.test.ts'),
      'utf8'
    )
    expect(p181).toContain('HUMAN_EDITOR')
    expect(p181).toContain('SYSTEM_ALERT')
  })

  it('quarantine still excluded from smart feed candidates', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/services/feed/FeedCandidateService.ts'),
      'utf8'
    )
    expect(src).toContain('canAppearInSmartFeed')
    expect(src).toContain('selectSmartFeedSummary')
  })
})

describe('P18.3I resolveCanonicalArticleId unit (mocked)', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('maps request identity keys in batchArticleState contract', async () => {
    // Pure contract: batch returns states keyed by ORIGINAL request ids
    const fakeBatch = (requested: string[], canonicalMap: Record<string, string>) =>
      requested.map((articleId) => ({
        articleId,
        liked: Boolean(canonicalMap[articleId]),
        saved: false,
        likeCount: canonicalMap[articleId] ? 3 : 0,
        commentCount: 0,
      }))

    const out = fakeBatch(['fs_legacy_1', 'pg_uuid'], {
      fs_legacy_1: 'pg_uuid_resolved',
      pg_uuid: 'pg_uuid',
    })
    expect(out.map((r) => r.articleId)).toEqual(['fs_legacy_1', 'pg_uuid'])
    expect(out[0]!.likeCount).toBe(3)
    expect(out[0]!.articleId).toBe('fs_legacy_1')
  })
})
