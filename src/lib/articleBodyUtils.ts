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

const MIN_HTML_PLAIN_CHARS = 250

/** Strip tags/scripts — rough plain-text length for HTML body quality checks. */
function extractPlainTextFromHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * htmlContent is often a source-page shell (DHA byline, date) while the real
 * article lives in description/content. Only prefer HTML when it carries enough body.
 */
function shouldUseHtmlContent(html: string | undefined, plainBody: string): boolean {
  const raw = html?.trim()
  if (!raw) return false

  const htmlPlain = extractPlainTextFromHtml(raw)
  if (htmlPlain.length < MIN_HTML_PLAIN_CHARS) return false

  const bodyLen = plainBody.trim().length
  if (bodyLen > 0 && htmlPlain.length < bodyLen * 0.4) return false

  return true
}

function stripLeadFromBody(body: string, lead: string): string {
  if (!body.trim() || !lead.trim()) return body

  const normBody = normalizeForCompare(body)
  const normLead = normalizeForCompare(lead)
  if (!normLead) return body
  if (normBody === normLead) return ''

  if (normBody.startsWith(normLead)) {
    const rest = body.slice(lead.length).trim().replace(/^[.!?…\s]+/, '')
    return rest
  }

  return body
}

/** Strip unsafe HTML for server-rendered article bodies (no jsdom — Vercel-safe). */
export function sanitizeArticleHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/<a\b[^>]*href\s*=\s*["'][^"']*["'][^>]*>([\s\S]*?)<\/a>/gi, '$1')
    .replace(/<img[^>]+>/gi, '')
    .replace(/<(\w+)[^>]*>\s*<\/\1>/gi, '')
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

  const displayBodyText = stripLeadFromBody(bodyText, leadText)
  const showLead = Boolean(leadText)
  const showBody = Boolean(displayBodyText)

  const hasHtmlContent = shouldUseHtmlContent(post.htmlContent, displayBodyText || bodyText)
  const sanitizedHtml = hasHtmlContent ? sanitizeArticleHtml(post.htmlContent!) : ''
  const paragraphs = !hasHtmlContent && showBody ? splitNewsParagraphs(displayBodyText) : []
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
