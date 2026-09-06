/**
 * Slim Feed Reader article payload — reuses canonical news + public-read gates.
 * No AI. No draft/rights-bypass exposure.
 */
import 'server-only'

import { getNewsBySlug } from '@/services/newsService.server'
import {
  canAppearInSmartFeed,
  canResolveArticleDetail,
  classifyPublicRead,
  publicReadMetaFromPost,
} from '@/services/editorial/publicReadPolicy'
import type { FeedReaderArticleDto } from '@/types/feedReader'
import { bodyFromPost } from '@/lib/feed/reader/bodyFromPost'

export type { FeedReaderArticleDto } from '@/types/feedReader'
export { bodyFromPost } from '@/lib/feed/reader/bodyFromPost'

export async function loadFeedReaderArticle(
  slug: string
): Promise<
  | { ok: true; article: FeedReaderArticleDto }
  | { ok: false; reason: 'not_found' | 'not_eligible' }
> {
  const post = await getNewsBySlug(slug)
  if (!post) return { ok: false, reason: 'not_found' }

  const cls = classifyPublicRead(publicReadMetaFromPost(post))
  if (!canResolveArticleDetail(cls) || !canAppearInSmartFeed(cls)) {
    return { ok: false, reason: 'not_eligible' }
  }

  const { bodyHtml, bodyText } = bodyFromPost(post)
  const video = post.mediaItems?.find((m) => m.type === 'video')?.url ?? null

  return {
    ok: true,
    article: {
      id: post.id,
      slug: post.slug,
      headline: post.title,
      summary: post.summary || null,
      category: post.categoryId || null,
      publishedAt: post.publishedAt ? new Date(post.publishedAt).toISOString() : null,
      image: post.coverImageUrl || post.mediaItems?.find((m) => m.type === 'image')?.url || null,
      video,
      publisher: {
        id: post.authorId || null,
        slug: post.authorUsername || null,
        name: post.authorDisplayName || post.source || null,
        logoUrl: post.authorPhotoURL || null,
      },
      source: post.source || post.sourceLabel || null,
      sourceUrl: post.sourceUrl || null,
      bodyHtml,
      bodyText,
      tags: Array.isArray(post.tags) ? post.tags.filter((t) => typeof t === 'string') : [],
      canonicalPath: `/haber/${post.slug}`,
    },
  }
}
