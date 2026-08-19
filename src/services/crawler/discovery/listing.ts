import * as cheerio from 'cheerio'
import type { DiscoveredFeedItem } from '../types'
import { hostnameOf, normalizeArticleUrl } from '../url/normalize'

const EXCLUDE_PATH =
  /\/(tag|tags|category|categories|author|authors|page|search|login|signup|register|account|privacy|cookie|terms|contact|about|video|videos|gallery|live)(\/|$)/i

function looksLikeArticlePath(pathname: string): boolean {
  if (pathname === '/' || pathname.length < 6) return false
  if (EXCLUDE_PATH.test(pathname)) return false
  if (/\.(jpg|jpeg|png|gif|webp|svg|css|js|xml|json|pdf|zip)(\?|$)/i.test(pathname)) {
    return false
  }
  if (/\/\d{4}\/\d{2}\//.test(pathname)) return true
  const slug = pathname.split('/').filter(Boolean).pop() || ''
  if ((slug.match(/-/g) || []).length >= 2 && slug.length >= 12) return true
  if (pathname.split('/').filter(Boolean).length >= 2 && slug.length >= 8) return true
  return false
}

export function parseListingPage(html: string, pageUrl: string): DiscoveredFeedItem[] {
  const $ = cheerio.load(html)
  const host = hostnameOf(pageUrl)
  const seen = new Set<string>()
  const items: DiscoveredFeedItem[] = []

  $('a[href]').each((_i, el) => {
    const href = $(el).attr('href')
    const normalized = normalizeArticleUrl(href || '', pageUrl)
    if (!normalized || seen.has(normalized)) return
    if (host && hostnameOf(normalized) !== host) return
    let pathname = '/'
    try {
      pathname = new URL(normalized).pathname
    } catch {
      return
    }
    if (!looksLikeArticlePath(pathname)) return
    seen.add(normalized)
    items.push({
      url: normalized,
      title: $(el).text().trim() || null,
    })
  })

  return items
}
