import DOMPurify from 'isomorphic-dompurify'
import { splitNewsParagraphs } from '@/lib/newsContent'
import {
  cleanupNewsBody,
  cleanupNewsSummary,
  cleanupNewsTitle,
} from '@/lib/newsContentCleanup'
import type { Post } from '@/types/post'

function normalizeForCompare(text: string): string {
  return text.trim().replace(/\s+/g, ' ')
}

/** Strip unsafe HTML for server-rendered article bodies. */
export function sanitizeArticleHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'ul', 'ol', 'li',
      'h2', 'h3', 'h4', 'blockquote', 'span', 'div',
    ],
    ALLOWED_ATTR: ['href', 'title', 'class'],
    ALLOW_DATA_ATTR: false,
  })
}

export function estimateReadMinutes(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.ceil(words / 200))
}

export interface ParsedArticleContent {
  articleTitle: string
  leadText: string
  bodyText: string
  showLead: boolean
  showBody: boolean
  hasHtmlContent: boolean
  sanitizedHtml: string
  paragraphs: string[]
  readMinutes: number
}

export function parseArticleContent(post: Post): ParsedArticleContent {
  const spotText = post.spot?.trim() || ''
  const summaryText = cleanupNewsSummary(post.summary?.trim() || '')
  const leadText = spotText || summaryText
  const bodyText = cleanupNewsBody(post.content?.trim() || '', { preserveSourceLine: false })
  const articleTitle = cleanupNewsTitle(post.title)

  const showLead = Boolean(leadText)
  const showBody =
    Boolean(bodyText) &&
    (!leadText || normalizeForCompare(bodyText) !== normalizeForCompare(leadText))

  const hasHtmlContent = Boolean(post.htmlContent?.trim())
  const sanitizedHtml = hasHtmlContent ? sanitizeArticleHtml(post.htmlContent!) : ''
  const paragraphs = !hasHtmlContent && showBody ? splitNewsParagraphs(bodyText) : []
  const readText = [post.summary, post.content].filter(Boolean).join(' ')

  return {
    articleTitle,
    leadText,
    bodyText,
    showLead,
    showBody,
    hasHtmlContent,
    sanitizedHtml,
    paragraphs,
    readMinutes: post.readingTimeMinutes ?? estimateReadMinutes(readText),
  }
}
