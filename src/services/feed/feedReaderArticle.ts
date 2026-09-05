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
import type { Post } from '@/types/post'
import type { FeedReaderArticleDto } from '@/types/feedReader'
import { filterBodyBlocksForArticleDisplay } from '@/lib/articleBlocksFromAi'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'

export type { FeedReaderArticleDto } from '@/types/feedReader'

function bodyFromPost(post: Post): { bodyHtml: string | null; bodyText: string | null } {
  if (post.bodyBlocks && post.bodyBlocks.length > 0) {
    const filtered = filterBodyBlocksForArticleDisplay(post.bodyBlocks, {
      title: post.title,
      spot: post.spot ?? undefined,
      summary: post.summary ?? undefined,
      coverImageUrl: post.coverImageUrl ?? undefined,
    })
    const text = articleBlocksToPlainText(filtered).trim()
    const html = text
      ? text
          .split(/\n{2,}/)
          .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
          .join('')
      : null
    return { bodyHtml: html, bodyText: text || null }
  }
  const raw = (post.htmlContent || post.content || '').trim()
  if (!raw) return { bodyHtml: null, bodyText: null }
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    return {
      bodyHtml: raw,
      bodyText: raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
    }
  }
  return {
    bodyHtml: raw
      .split(/\n{2,}/)
      .map((p) => `<p>${escapeHtml(p.trim())}</p>`)
      .join(''),
    bodyText: raw,
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function loadFeedReaderArticle(slug: string): Promise<
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
