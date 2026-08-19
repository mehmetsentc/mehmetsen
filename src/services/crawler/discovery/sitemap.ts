import * as cheerio from 'cheerio'
import type { DiscoveredFeedItem } from '../types'
import { normalizeArticleUrl } from '../url/normalize'

export interface SitemapParseResult {
  kind: 'urlset' | 'index'
  items: DiscoveredFeedItem[]
  childSitemaps: string[]
}

function locOf($el: cheerio.Cheerio<any>): string {
  return (
    $el.find('loc').first().text().trim() ||
    $el.find('n\\:loc, news\\:loc').first().text().trim()
  )
}

function lastmodOf($el: cheerio.Cheerio<any>): Date | null {
  const raw =
    $el.find('lastmod').first().text().trim() ||
    $el.find('news\\:publication_date, n\\:publication_date').first().text().trim()
  if (!raw) return null
  const d = new Date(raw)
  return Number.isNaN(d.getTime()) ? null : d
}

export function parseSitemapXml(xml: string, baseUrl?: string): SitemapParseResult {
  const $ = cheerio.load(xml, { xml: true })
  const childSitemaps: string[] = []
  $('sitemapindex sitemap, sitemap').each((_i, el) => {
    if ($(el).closest('urlset').length) return
    const loc = normalizeArticleUrl(locOf($(el)), baseUrl)
    if (loc) childSitemaps.push(loc)
  })

  const items: DiscoveredFeedItem[] = []
  $('urlset url, url').each((_i, el) => {
    const $url = $(el)
    if ($url.closest('sitemapindex').length) return
    const loc = normalizeArticleUrl(locOf($url), baseUrl)
    if (!loc) return
    const title =
      $url.find('news\\:title, n\\:title').first().text().trim() || null
    items.push({
      url: loc,
      title,
      publishedAt: lastmodOf($url),
    })
  })

  if (childSitemaps.length && !items.length) {
    return { kind: 'index', items: [], childSitemaps }
  }
  return { kind: 'urlset', items, childSitemaps: [] }
}
