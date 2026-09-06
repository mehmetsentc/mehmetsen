/**
 * Canonical Post body → Feed Reader HTML (shared client/server-safe helpers).
 * No AI. Fail-closed sanitization for raw HTML.
 */
import type { Post } from '@/types/post'
import { filterBodyBlocksForArticleDisplay } from '@/lib/articleBlocksFromAi'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'
import { articleBlocksToSafeHtml } from '@/lib/publisher/contentDomain'
import {
  plainTextToReaderParagraphs,
  sanitizeFeedReaderHtml,
} from '@/lib/feed/reader/sanitizeBodyHtml'

/**
 * Prefer structured bodyBlocks (preserve h2–h4 / lists / figures).
 * Never flatten headings to paragraphs.
 * Sanitize raw HTML fail-closed; plain text → paragraphs only.
 */
export function bodyFromPost(post: Post): { bodyHtml: string | null; bodyText: string | null } {
  if (post.bodyBlocks && post.bodyBlocks.length > 0) {
    const filtered = filterBodyBlocksForArticleDisplay(post.bodyBlocks, {
      title: post.title,
      spot: post.spot ?? undefined,
      summary: post.summary ?? undefined,
      coverImageUrl: post.coverImageUrl ?? undefined,
    })
    const text = articleBlocksToPlainText(filtered).trim()
    const html = articleBlocksToSafeHtml(filtered).trim()
    return { bodyHtml: html || null, bodyText: text || null }
  }
  const raw = (post.htmlContent || post.content || '').trim()
  if (!raw) return { bodyHtml: null, bodyText: null }
  if (/<[a-z][\s\S]*>/i.test(raw)) {
    const bodyHtml = sanitizeFeedReaderHtml(raw)
    return {
      bodyHtml: bodyHtml || null,
      bodyText: bodyHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null,
    }
  }
  return {
    bodyHtml: plainTextToReaderParagraphs(raw) || null,
    bodyText: raw,
  }
}
