import * as cheerio from 'cheerio'
import { normalizeArticleUrl } from '../url/normalize'

export interface OpenGraphArticle {
  title: string | null
  description: string | null
  image: string | null
  publishedAt: Date | null
  modifiedAt: Date | null
  author: string | null
  canonicalUrl: string | null
  siteName: string | null
  locale: string | null
}

function meta($: cheerio.CheerioAPI, keys: string[]): string | null {
  for (const key of keys) {
    const val =
      $(`meta[property="${key}"]`).attr('content')?.trim() ||
      $(`meta[name="${key}"]`).attr('content')?.trim()
    if (val) return val
  }
  return null
}

function dateOf(raw: string | null): Date | null {
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function extractOpenGraph(html: string, pageUrl: string): OpenGraphArticle {
  const $ = cheerio.load(html)
  const canonical =
    $('link[rel="canonical"]').attr('href')?.trim() ||
    meta($, ['og:url']) ||
    null
  return {
    title: meta($, ['og:title', 'twitter:title']) || $('title').first().text().trim() || null,
    description: meta($, ['og:description', 'description', 'twitter:description']),
    image: meta($, ['og:image', 'og:image:secure_url', 'twitter:image']),
    publishedAt: dateOf(meta($, ['article:published_time', 'pubdate', 'publishdate', 'datePublished'])),
    modifiedAt: dateOf(meta($, ['article:modified_time', 'og:updated_time'])),
    author: meta($, ['article:author', 'author', 'dc.creator']),
    canonicalUrl: canonical ? normalizeArticleUrl(canonical, pageUrl) : null,
    siteName: meta($, ['og:site_name']),
    locale: meta($, ['og:locale', 'language']),
  }
}
