/**
 * Scraper Worker — RSS'i olmayan veya 403 veren yerel haber sitelerini HTML scraping ile çeker.
 *
 * Akış:
 *   1. Portal'ın liste sayfasını fetch et (anasayfa / kategori)
 *   2. Cheerio ile haber linklerini çıkar (CSS selector veya generic pattern)
 *   3. Yeni linkleri URL hash ile deduplikasyon yap
 *   4. Her yeni link → queue'ya ekle (pipeline process-queue ile işlenir)
 *
 * Not: İçerik extraction pipeline'da yapılır — burada sadece link toplama yapılır.
 * Bu sayede scraper worker hafif kalır ve timeout riski azalır.
 */
import * as cheerio from 'cheerio'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { buildSourceUrlHash } from '@/lib/newsDedupe'
import { enqueueNewsItem } from '@/services/newsroom/queue/newsQueueService'
import { normalizeCitySlug } from '@/constants/cities'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'
import type { ScraperSource } from '@/services/newsroom/sources/scraperSources'

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8',
  'Cache-Control': 'no-cache',
  // Referer: Google gibi davran — birçok site bunu kontrol eder
  Referer: 'https://www.google.com/',
}

const FETCH_TIMEOUT_MS = 12_000
const MAX_HTML_BYTES = 300_000

const TR_MONTHS: Record<string, number> = {
  ocak: 0,
  subat: 1,
  mart: 2,
  nisan: 3,
  mayis: 4,
  haziran: 5,
  temmuz: 6,
  agustos: 7,
  eylul: 8,
  ekim: 9,
  kasim: 10,
  aralik: 11,
}

function normalizeTrMonthToken(raw: string): string {
  return raw
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

/** Parse common Turkish list-page dates → epoch ms. */
function parseTrListDate(text: string, now = Date.now()): number | null {
  const raw = text.replace(/\s+/g, ' ').trim()
  if (!raw) return null
  const lower = raw.toLocaleLowerCase('tr-TR')
  if (/\bbug[uü]n\b/.test(lower)) {
    const d = new Date(now)
    d.setHours(12, 0, 0, 0)
    return d.getTime()
  }
  if (/\bd[uü]n\b/.test(lower)) {
    const d = new Date(now - 86_400_000)
    d.setHours(12, 0, 0, 0)
    return d.getTime()
  }
  const numeric = raw.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/)
  if (numeric) {
    const day = Number(numeric[1])
    const month = Number(numeric[2]) - 1
    let year = Number(numeric[3])
    if (year < 100) year += 2000
    const d = new Date(Date.UTC(year, month, day, 9, 0, 0))
    if (!Number.isNaN(d.getTime())) return d.getTime()
  }
  const named = lower.match(/(\d{1,2})\s+([a-zçğıöşü]+)\s+(\d{4})/)
  if (named) {
    const month = TR_MONTHS[normalizeTrMonthToken(named[2]!)]
    if (month != null) {
      const d = new Date(Date.UTC(Number(named[3]), month, Number(named[1]), 9, 0, 0))
      if (!Number.isNaN(d.getTime())) return d.getTime()
    }
  }
  return null
}

/** Parse dates embedded in URL slugs (e.g. /13-08-2026-..., /anons-tarihi-13-08-2026-). */
function parseDateFromUrl(url: string): number | null {
  try {
    const path = new URL(url).pathname
    const m =
      path.match(/(?:^|\/|-)(\d{1,2})-(\d{1,2})-(20\d{2})(?:-|\/|$)/) ||
      path.match(/(?:^|\/|-)(20\d{2})-(\d{1,2})-(\d{1,2})(?:-|\/|$)/)
    if (!m) return null
    let day: number
    let month: number
    let year: number
    if (m[0].includes(m[3]!) && Number(m[3]) > 31) {
      // dd-mm-yyyy
      day = Number(m[1])
      month = Number(m[2]) - 1
      year = Number(m[3])
    } else if (Number(m[1]) > 31) {
      // yyyy-mm-dd
      year = Number(m[1])
      month = Number(m[2]) - 1
      day = Number(m[3])
    } else {
      day = Number(m[1])
      month = Number(m[2]) - 1
      year = Number(m[3])
    }
    const d = new Date(Date.UTC(year, month, day, 9, 0, 0))
    return Number.isNaN(d.getTime()) ? null : d.getTime()
  } catch {
    return null
  }
}

function contextDateNearElement($: cheerio.CheerioAPI, el: any): number | null {
  const $el = $(el)
  const blobs = [
    $el.text(),
    $el.parent().text(),
    $el.closest('li, article, tr, .card, .item, .list-item').text(),
  ]
  for (const blob of blobs) {
    const ts = parseTrListDate(blob.slice(0, 420))
    if (ts) return ts
  }
  const dt =
    $el.find('time[datetime]').attr('datetime') ||
    $el.closest('li, article, tr').find('time[datetime]').attr('datetime')
  if (dt) {
    const ms = Date.parse(dt)
    if (!Number.isNaN(ms)) return ms
  }
  return null
}


/** Resolve list-page hrefs; fix root-relative paths missing a leading slash (.bel.tr). */
function resolveListHref(href: string, listPageUrl: string): URL | null {
  if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) return null
  try {
    if (
      !href.startsWith('http') &&
      !href.startsWith('//') &&
      !href.startsWith('/') &&
      !href.startsWith('#') &&
      !href.startsWith('?') &&
      href.includes('/')
    ) {
      const origin = new URL(listPageUrl).origin
      return new URL('/' + href.replace(/^\.\//, ''), origin)
    }
    return new URL(href, listPageUrl)
  } catch {
    return null
  }
}

/** Bir liste sayfasından HTML al */
async function fetchListPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    })
    clearTimeout(timer)
    if (!res.ok) {
      console.warn(`[scraper] ${url} HTTP ${res.status}`)
      return null
    }
    const reader = res.body?.getReader()
    if (!reader) return null
    const decoder = new TextDecoder('utf-8')
    let html = ''
    let bytes = 0
    while (bytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
      bytes += value?.length ?? 0
    }
    reader.cancel()
    return html.length > 500 ? html : null
  } catch (err) {
    console.warn(`[scraper] ${url} fetch failed:`, err instanceof Error ? err.message : String(err))
    return null
  }
}

/**
 * HTML'den makale linklerini (+ mümkünse tarih) çıkar.
 */
function extractArticleLinks(
  html: string,
  source: ScraperSource,
  listPageUrl: string
): Array<{ url: string; publishedAt: number | null }> {
  const $ = cheerio.load(html)
  const baseUrl = new URL(listPageUrl)
  const domain = baseUrl.hostname
  const linkPattern = source.linkPattern ? new RegExp(source.linkPattern, 'i') : null
  const excludePattern = source.linkExcludePattern
    ? new RegExp(source.linkExcludePattern, 'i')
    : null

  // Pagination / taxonomy — not CMS paths like canakkale.bel.tr `/tr/sayfa/NNNN-...`
  const GENERIC_EXCLUDE =
    /\/(tag|etiket|category|author|yazar|page)[=/]|\/kategori\/[^/]+\/?$|\?page=|\?p=|#/i

  const seen = new Set<string>()
  const results: Array<{ url: string; publishedAt: number | null }> = []
  const selector = source.linkSelector ?? 'a[href]'

  $(selector).each((_i, el) => {
    const href = $(el).attr('href')
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) return

    const resolved = resolveListHref(href, listPageUrl)
    if (!resolved) return

    if (!resolved.hostname.includes(domain.replace(/^www\./, ''))) return

    resolved.hash = ''
    const cleanUrl = resolved.href.split('?')[0]!
    if (seen.has(cleanUrl)) return
    seen.add(cleanUrl)

    const path = resolved.pathname
    if (linkPattern && !linkPattern.test(cleanUrl)) return

    if (!linkPattern) {
      const looksLikeArticle =
        /\/(haber|haberler|detay|icerik|news|article|makale|yazi|post|duyuru|anons)s?[/-]/i.test(
          path
        ) ||
        /\/\d{5,}/.test(path) ||
        /\/\d{4}\/\d{2}\/\d{2}\//.test(path)
      if (!looksLikeArticle) return
    }

    if (excludePattern && excludePattern.test(cleanUrl)) return
    if (GENERIC_EXCLUDE.test(cleanUrl)) return
    if (path.split('/').filter(Boolean).length < 1) return

    results.push({
      url: cleanUrl,
      publishedAt: contextDateNearElement($, el) ?? parseDateFromUrl(cleanUrl),
    })
    if (results.length >= source.maxItems * 3) return false
  })

  return results.slice(0, source.maxItems * 2)
}

/** Tek bir scraper source'u çalıştır */
export async function runSingleScraperSource(
  source: ScraperSource
): Promise<{
  sourceId: string
  fetched: number
  queued: number
  skippedOld: number
  errors: string[]
}> {
  const db = getAdminFirestore()
  const errors: string[] = []
  const allLinks = new Map<string, number | null>()
  let skippedOld = 0
  const now = Date.now()
  const maxAgeMs = source.maxAgeMs

  for (const listUrl of source.listUrls) {
    const html = await fetchListPage(listUrl)
    if (!html) {
      errors.push(`[scraper:${source.id}] fetch failed: ${listUrl}`)
      continue
    }
    for (const link of extractArticleLinks(html, source, listUrl)) {
      if (!allLinks.has(link.url)) allLinks.set(link.url, link.publishedAt)
    }
  }

  const citySlug = normalizeCitySlug(source.localMeta.citySlug)
  const categoryId = source.forcedCategoryId?.trim() || 'yerel-haber'
  let queued = 0

  for (const [url, publishedAt] of [...allLinks.entries()].slice(0, source.maxItems * 2)) {
    // When maxAgeMs is set (e.g. bel duyuru 12h), require a parseable date in window.
    if (maxAgeMs != null) {
      if (publishedAt == null || now - publishedAt > maxAgeMs) {
        skippedOld++
        continue
      }
    }
    if (queued >= source.maxItems) break

    const urlHash = buildSourceUrlHash(url)

    try {
      await enqueueNewsItem(db, {
        workerId: 'local-news',
        changeType: 'new',
        sourceId: source.id,
        fingerprintHash: urlHash,
        input: {
          editorId: 'local-news',
          editorType: 'local',
          sourceLabel: source.label,
          sourceUrl: url,
          originalTitle: '',
          originalSummary: '',
          originalContent: '',
          rssFingerprint: urlHash,
          ingestionSourceId: source.id,
          forcedCategoryId: categoryId,
          lockForcedCategory: source.lockForcedCategory === true,
          forcedCitySlug: citySlug,
          forcedCity: source.localMeta.cityName,
          ...(publishedAt != null ? { sourcePublishedAt: publishedAt } : {}),
          ...(source.localMeta.district ? { forcedDistrict: source.localMeta.district } : {}),
          extraTags: [
            citySlug,
            ...(categoryId === 'yerel-duyuru' ? ['bel-duyuru'] : []),
            ...(source.localMeta.district
              ? [source.localMeta.district.toLocaleLowerCase('tr-TR').replace(/\s+/g, '-')]
              : []),
          ],
        },
      })
      queued++
    } catch (err) {
      const msg = `[scraper:${source.id}] enqueue failed for ${url}: ${err instanceof Error ? err.message : String(err)}`
      console.warn(msg)
      errors.push(msg)
    }
  }

  if (allLinks.size > 0) {
    console.log(
      `[scraper:${source.id}] fetched=${allLinks.size} queued=${queued} skippedOld=${skippedOld}`
    )
  }

  return { sourceId: source.id, fetched: allLinks.size, queued, skippedOld, errors }
}

/** Birden fazla scraper source'u paralel çalıştır (max concurrency 4) */
export async function runScraperSources(
  sources: ScraperSource[]
): Promise<NewsroomRunResult> {
  const result = emptyNewsroomResult('local-news')
  const started = Date.now()

  const CONCURRENCY = 4
  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const batch = sources.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(batch.map((s) => runSingleScraperSource(s)))

    for (const r of results) {
      result.sourcesChecked++
      if (r.status === 'fulfilled') {
        result.itemsFetched += r.value.fetched
        result.itemsNew += r.value.queued
        result.itemsSkipped += r.value.skippedOld
        result.errors.push(...r.value.errors)
      } else {
        result.itemsFailed++
        result.errors.push(String(r.reason))
      }
    }
  }

  result.durationMs = Date.now() - started
  return result
}
