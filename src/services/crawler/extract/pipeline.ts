import type { ExtractedArticleContent } from '../types'
import { detectLanguage } from '../language'
import { hostnameOf } from '../url/normalize'
import { extractJsonLdArticle } from './jsonld'
import { extractOpenGraph } from './opengraph'
import { extractSemanticArticle, extractWithDomainRule, htmlToPlainText } from './semantic'
import { articleTextStats, boilerplateRatio, computeExtractionConfidence } from './confidence'
import { extractWithArticleExtractor } from './generic'

const MIN_BODY_CHARS = 220

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    if (value && value.trim()) return value.trim()
  }
  return null
}

function uniqueUrls(urls: Array<string | null | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const url of urls) {
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push(url)
  }
  return out
}

function withStats(
  partial: Omit<ExtractedArticleContent, 'wordCount' | 'charCount' | 'paragraphCount' | 'extractionConfidence'> & {
    extractionConfidence?: number
  }
): ExtractedArticleContent {
  const stats = articleTextStats(partial.articleBodyText)
  const titleLen = (partial.title || '').trim().split(/\s+/).filter(Boolean).length || 1
  const confidence =
    partial.extractionConfidence ??
    computeExtractionConfidence({
      titleExists: Boolean(partial.title),
      bodyExists: stats.charCount > 0,
      wordCount: stats.wordCount,
      charCount: stats.charCount,
      paragraphCount: stats.paragraphCount,
      publishedAtExists: Boolean(partial.publishedAt),
      canonicalExists: Boolean(partial.canonicalUrl),
      mainImageExists: Boolean(partial.mainImageUrl),
      bodyTitleRatio: stats.wordCount / titleLen,
      boilerplateRatio: boilerplateRatio(partial.articleBodyText, partial.title || ''),
    })
  return { ...partial, ...stats, extractionConfidence: confidence }
}

export function extractArticle(html: string, pageUrl: string, sourceLanguage?: string | null): ExtractedArticleContent {
  const jsonld = extractJsonLdArticle(html, pageUrl)
  const og = extractOpenGraph(html, pageUrl)
  const host = hostnameOf(pageUrl)
  const domain = host ? extractWithDomainRule(html, host) : null
  const semantic = extractSemanticArticle(html)

  let bodyText = ''
  let bodyHtml = ''
  let method = 'failed'
  let baseConfidence = 0.1

  if (jsonld?.articleBody && jsonld.articleBody.trim().length >= MIN_BODY_CHARS) {
    bodyText = jsonld.articleBody.trim()
    bodyHtml = `<p>${escapeHtml(bodyText).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`
    method = 'jsonld'
    baseConfidence = 0.92
  } else if (domain && domain.text.length >= MIN_BODY_CHARS) {
    bodyText = domain.text
    bodyHtml = domain.html
    method = 'domain-rule'
    baseConfidence = 0.88
  } else if (semantic.text.length >= MIN_BODY_CHARS) {
    bodyText = semantic.text
    bodyHtml = semantic.html
    method = semantic.method === 'semantic' ? 'semantic-html' : 'density'
    baseConfidence = semantic.method === 'semantic' ? 0.78 : 0.58
  } else if (jsonld?.articleBody && jsonld.articleBody.trim().length >= 80) {
    bodyText = jsonld.articleBody.trim()
    bodyHtml = `<p>${escapeHtml(bodyText)}</p>`
    method = 'jsonld-short'
    baseConfidence = 0.45
  }

  const title = firstNonEmpty(jsonld?.title, og.title, domain?.title)
  const description = firstNonEmpty(jsonld?.description, og.description)
  const language = detectLanguage(
    [title, description, bodyText].filter(Boolean).join('\n'),
    jsonld?.language || og.locale?.slice(0, 2) || sourceLanguage
  )

  if (bodyText.length < MIN_BODY_CHARS) {
    method = method === 'failed' ? 'meta-only' : method
    baseConfidence = Math.min(baseConfidence, 0.25)
  }

  return withStats({
    title,
    description,
    articleBodyText: bodyText,
    articleBodyHtml: bodyHtml,
    author: firstNonEmpty(jsonld?.author, og.author, domain?.author),
    publishedAt: jsonld?.publishedAt || og.publishedAt,
    modifiedAt: jsonld?.modifiedAt || og.modifiedAt,
    language,
    canonicalUrl: jsonld?.canonicalUrl || og.canonicalUrl,
    mainImageUrl: jsonld?.imageUrls[0] || og.image,
    imageUrls: uniqueUrls([...(jsonld?.imageUrls || []), og.image]),
    videoUrls: [],
    extractionMethod: method,
    extractionConfidence: baseConfidence,
  })
}

export async function extractArticleWithFallback(
  html: string,
  pageUrl: string,
  sourceLanguage?: string | null
): Promise<ExtractedArticleContent> {
  const primary = extractArticle(html, pageUrl, sourceLanguage)
  if (primary.articleBodyText.trim().length >= MIN_BODY_CHARS) return primary
  const generic = await extractWithArticleExtractor(html, pageUrl)
  if (!generic) return primary
  return withStats({
    ...primary,
    title: primary.title || generic.title,
    articleBodyText: generic.text,
    articleBodyHtml: generic.html,
    extractionMethod: 'generic-readability',
    extractionConfidence: 0.62,
  })
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export { htmlToPlainText }
