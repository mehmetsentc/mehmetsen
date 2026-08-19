import * as cheerio from 'cheerio'
import type { DiscoveredFeedItem } from '../types'
import { normalizeArticleUrl } from '../url/normalize'

function decodeXmlText(value: string | undefined | null): string {
  if (!value) return ''
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

function parseDate(value: string | undefined | null): Date | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function firstText($el: cheerio.Cheerio<any>, selectors: string[]): string {
  for (const selector of selectors) {
    const text = decodeXmlText($el.find(selector).first().text())
    if (text) return text
  }
  return ''
}

function itemLink($item: cheerio.Cheerio<any>, baseUrl?: string): string | null {
  const guidIsPermalink = $item.find('guid').attr('isPermaLink')
  const candidates = [
    $item.find('link').first().attr('href'),
    $item.find('link').first().text(),
    guidIsPermalink !== 'false' ? $item.find('guid').first().text() : '',
    $item.find('id').first().text(),
  ]
  for (const raw of candidates) {
    const normalized = normalizeArticleUrl(decodeXmlText(raw), baseUrl)
    if (normalized) return normalized
  }
  return null
}

export function parseRssFeed(xml: string, baseUrl?: string): DiscoveredFeedItem[] {
  const $ = cheerio.load(xml, { xml: true })
  const items: DiscoveredFeedItem[] = []
  $('item').each((_i, el) => {
    const $item = $(el)
    const url = itemLink($item, baseUrl)
    if (!url) return
    items.push({
      url,
      title: firstText($item, ['title']) || null,
      publishedAt: parseDate(firstText($item, ['pubDate', 'published', 'dc\\:date'])),
    })
  })
  return items
}

export function parseAtomFeed(xml: string, baseUrl?: string): DiscoveredFeedItem[] {
  const $ = cheerio.load(xml, { xml: true })
  const items: DiscoveredFeedItem[] = []
  $('entry').each((_i, el) => {
    const $item = $(el)
    const url = itemLink($item, baseUrl)
    if (!url) return
    items.push({
      url,
      title: firstText($item, ['title']) || null,
      publishedAt: parseDate(firstText($item, ['published', 'updated'])),
    })
  })
  return items
}

export function parseRssOrAtom(xml: string, baseUrl?: string): DiscoveredFeedItem[] {
  const rss = parseRssFeed(xml, baseUrl)
  if (rss.length) return rss
  return parseAtomFeed(xml, baseUrl)
}
