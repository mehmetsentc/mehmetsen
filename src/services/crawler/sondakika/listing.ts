import * as cheerio from 'cheerio'
import type { DiscoveredFeedItem } from '../types'
import { normalizeArticleUrl } from '../url/normalize'
import { SONDAKIKA_DOMAIN } from './registry'

/**
 * SONDAKIKA-81: il sayfası (https://www.sondakika.com/{il}/) ayrıştırıcı.
 *
 * Genel parseListingPage sayfadaki TÜM linkleri (menü, il listesi, slider, etiket)
 * alır ve saat/görsel/özet vermez. Burada yalnız haber kartları okunur:
 *   - li.nws: tam tarih-saat (title="15.11.2026 20:52:00"), başlık, özet, görsel
 *   - .new3slide (üst manşet): saat yok → publishedAt null (detay JSON-LD'den gelir)
 * Haber URL'si: /{bölüm}/haber-{slug}-{sayısal-id}/
 */

const ARTICLE_PATH_RE = /^\/[a-z0-9-]+\/haber-[a-z0-9-]+-\d{5,}\/?$/i

export function isSondakikaHost(hostOrUrl: string): boolean {
  let host = hostOrUrl
  try {
    host = new URL(hostOrUrl).hostname
  } catch {
    /* zaten host */
  }
  return host.toLowerCase().replace(/^www\./, '') === SONDAKIKA_DOMAIN
}

/** "15.11.2026 20:52:00" → Date (Türkiye sabit UTC+3). */
export function parseSondakikaDateTime(raw: string | undefined | null): Date | null {
  const m = raw?.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return null
  const [, d, mo, y, h, mi, se = '00'] = m
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}+03:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

/** Liste görselinin küçük crop'unu detay sayfasının kullandığı 1210px boyuna çevirir. */
export function upscaleSondakikaImage(url: string | null | undefined): string | null {
  if (!url) return null
  return url.replace(/\/crop\/\d+x\d+\/(webp\/)?/, '/crop/1210x0/')
}

function absUrl(raw: string | undefined, base: string): string | null {
  if (!raw) return null
  try {
    return new URL(raw, base).toString()
  } catch {
    return null
  }
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim()

function articleUrl(href: string | undefined, pageUrl: string): string | null {
  if (!href) return null
  const normalized = normalizeArticleUrl(href, pageUrl)
  if (!normalized) return null
  try {
    const u = new URL(normalized)
    if (!isSondakikaHost(u.hostname) || !ARTICLE_PATH_RE.test(u.pathname)) return null
  } catch {
    return null
  }
  return normalized
}

export function parseSondakikaListing(html: string, pageUrl: string): DiscoveredFeedItem[] {
  const $ = cheerio.load(html)
  const out = new Map<string, DiscoveredFeedItem>()

  $('li.nws').each((_i, li) => {
    const $li = $(li)
    const a = $li.find('a.content[href]').first()
    const url = articleUrl(a.attr('href'), pageUrl)
    if (!url) return
    const img = $li.find('img[src]').first().attr('src')
    out.set(url, {
      url,
      title: clean(a.attr('title') || a.text()) || null,
      description: clean($li.find('.news-detail').text()) || null,
      imageUrl: upscaleSondakikaImage(absUrl(img, pageUrl)),
      publishedAt: parseSondakikaDateTime($li.find('.news-time-dark[title]').first().attr('title')),
    })
  })

  $('.new3slide a[href]').each((_i, el) => {
    const a = $(el)
    const url = articleUrl(a.attr('href'), pageUrl)
    if (!url || out.has(url)) return
    const img = a.find('img').attr('src')
    out.set(url, {
      url,
      title: clean(a.attr('title') || a.find('h2').text()) || null,
      description: null,
      imageUrl: upscaleSondakikaImage(absUrl(img, pageUrl)),
      publishedAt: null,
    })
  })

  return [...out.values()]
}
