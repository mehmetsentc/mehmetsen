import * as cheerio from 'cheerio'
import { normalizeArticleUrl } from '../url/normalize'

const ARTICLE_TYPES = new Set([
  'NewsArticle',
  'Article',
  'ReportageNewsArticle',
  'LiveBlogPosting',
  'BlogPosting',
  'ScholarlyArticle',
])

function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return []
  return Array.isArray(value) ? value : [value]
}

function typeNames(node: unknown): string[] {
  if (!node || typeof node !== 'object') return []
  const t = (node as { '@type'?: unknown })['@type']
  return asArray(t).map((x) => String(x).split('/').pop() || String(x))
}

function walk(node: unknown, acc: Record<string, unknown>[]): void {
  if (!node) return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, acc)
    return
  }
  if (typeof node !== 'object') return
  const rec = node as Record<string, unknown>
  if (typeNames(rec).some((t) => ARTICLE_TYPES.has(t))) acc.push(rec)
  if (rec['@graph']) walk(rec['@graph'], acc)
}

function textOf(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value.trim() || null
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return textOf(value[0])
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return textOf(rec.name || rec['@value'] || rec.headline || rec.articleBody)
  }
  return null
}

function dateOf(value: unknown): Date | null {
  const raw = textOf(value)
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

function urlOf(value: unknown, baseUrl: string): string | null {
  if (!value) return null
  if (typeof value === 'string') return normalizeArticleUrl(value, baseUrl)
  if (Array.isArray(value)) return urlOf(value[0], baseUrl)
  if (typeof value === 'object') {
    const rec = value as Record<string, unknown>
    return urlOf(rec.url || rec.contentUrl || rec['@id'], baseUrl)
  }
  return null
}

export interface JsonLdArticle {
  title: string | null
  description: string | null
  articleBody: string | null
  author: string | null
  publishedAt: Date | null
  modifiedAt: Date | null
  canonicalUrl: string | null
  imageUrls: string[]
  language: string | null
}

export function extractJsonLdArticle(html: string, pageUrl: string): JsonLdArticle | null {
  const $ = cheerio.load(html)
  const found: Record<string, unknown>[] = []
  $('script[type="application/ld+json"]').each((_i, el) => {
    const raw = $(el).contents().text()
    if (!raw.trim()) return
    try {
      walk(JSON.parse(raw), found)
    } catch {
      // malformed JSON-LD is ignored
    }
  })
  if (!found.length) return null
  const node = found[0]
  const images = asArray(node.image)
    .map((img) => urlOf(img, pageUrl))
    .filter((u): u is string => Boolean(u))

  const body =
    textOf(node.articleBody) ||
    textOf(node.text) ||
    textOf((node.liveBlogUpdate as unknown) && asArray(node.liveBlogUpdate)[0])

  return {
    title: textOf(node.headline) || textOf(node.name),
    description: textOf(node.description) || textOf(node.abstract),
    articleBody: body,
    author: textOf(node.author),
    publishedAt: dateOf(node.datePublished),
    modifiedAt: dateOf(node.dateModified),
    canonicalUrl: urlOf(node.mainEntityOfPage, pageUrl) || urlOf(node.url, pageUrl),
    imageUrls: images,
    language: textOf(node.inLanguage),
  }
}
