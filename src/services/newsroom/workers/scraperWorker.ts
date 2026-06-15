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

/** Bir liste sayfasından HTML al */
async function fetchListPage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) {
      console.warn(`[scraper] ${url} → HTTP ${res.status}`)
      return null
    }
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('html')) return null

    const reader = res.body?.getReader()
    if (!reader) return null

    let html = ''
    let bytes = 0
    const decoder = new TextDecoder('utf-8', { fatal: false })
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
 * HTML'den makale linklerini çıkar.
 *
 * Önce linkSelector (varsa) dener, sonra generic article-link detection yapar:
 * — Aynı domain'den iç linkler
 * — URL'de haber benzeri pattern (sayısal ID veya /haber/, /detay/ vb.)
 * — Paginator, tag, kategori sayfaları hariç
 */
function extractArticleLinks(
  html: string,
  source: ScraperSource,
  listPageUrl: string
): string[] {
  const $ = cheerio.load(html)
  const baseUrl = new URL(listPageUrl)
  const domain = baseUrl.hostname
  const linkPattern = source.linkPattern ? new RegExp(source.linkPattern, 'i') : null
  const excludePattern = source.linkExcludePattern
    ? new RegExp(source.linkExcludePattern, 'i')
    : null

  // Generic exclusion — pagination, tag, author, category pages
  const GENERIC_EXCLUDE = /\/(tag|etiket|kategori|category|author|yazar|page|sayfa)[=/]|\?page=|\?p=|#/i

  const seen = new Set<string>()
  const results: string[] = []

  const selector = source.linkSelector ?? 'a[href]'

  $(selector).each((_i, el) => {
    const href = $(el).attr('href')
    if (!href || href.startsWith('javascript:') || href.startsWith('mailto:')) return

    // Resolve URL
    let resolved: URL
    try {
      resolved = new URL(href, listPageUrl)
    } catch {
      return
    }

    // Must be same domain (allow www. variants)
    if (!resolved.hostname.includes(domain.replace(/^www\./, ''))) return

    // Remove hash and search params for dedup
    resolved.hash = ''
    const cleanUrl = resolved.href.split('?')[0]!

    if (seen.has(cleanUrl)) return
    seen.add(cleanUrl)

    const path = resolved.pathname

    // Apply linkPattern filter (if specified)
    if (linkPattern && !linkPattern.test(cleanUrl)) return

    // Generic article detection if no custom pattern
    if (!linkPattern) {
      // Must contain: news-like path OR 5+ digit number (article ID)
      const looksLikeArticle =
        /\/(haber|haberler|detay|icerik|news|article|makale|yazi|post)s?[/-]/i.test(path) ||
        /\/\d{5,}/.test(path) ||
        /\/\d{4}\/\d{2}\/\d{2}\//.test(path) // date-based URLs

      if (!looksLikeArticle) return
    }

    // Apply exclusion patterns
    if (excludePattern && excludePattern.test(cleanUrl)) return
    if (GENERIC_EXCLUDE.test(cleanUrl)) return

    // Minimum path depth (avoid homepage link = just "/")
    if (path.split('/').filter(Boolean).length < 1) return

    results.push(cleanUrl)
    if (results.length >= source.maxItems * 3) return false // cheerio each early exit
  })

  return results.slice(0, source.maxItems * 2) // Return 2x to allow for dedup in caller
}

/** Tek bir scraper source'u çalıştır */
export async function runSingleScraperSource(
  source: ScraperSource
): Promise<{ sourceId: string; fetched: number; queued: number; errors: string[] }> {
  const db = getAdminFirestore()
  const errors: string[] = []
  const allLinks = new Set<string>()

  // Fetch from all list URLs
  for (const listUrl of source.listUrls) {
    const html = await fetchListPage(listUrl)
    if (!html) {
      errors.push(`[scraper:${source.id}] fetch failed: ${listUrl}`)
      continue
    }
    const links = extractArticleLinks(html, source, listUrl)
    for (const l of links) allLinks.add(l)
  }

  const citySlug = normalizeCitySlug(source.localMeta.citySlug)
  let queued = 0

  for (const url of [...allLinks].slice(0, source.maxItems)) {
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
          // İçerik yok — pipeline process-queue aşamasında extraction yapar
          originalTitle: '',
          originalSummary: '',
          originalContent: '',
          rssFingerprint: urlHash,
          ingestionSourceId: source.id,
          forcedCategoryId: 'yerel-haber',
          forcedCitySlug: citySlug,
          forcedCity: source.localMeta.cityName,
          ...(source.localMeta.district ? { forcedDistrict: source.localMeta.district } : {}),
          extraTags: [
            citySlug,
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
    console.log(`[scraper:${source.id}] fetched=${allLinks.size} queued=${queued}`)
  }

  return { sourceId: source.id, fetched: allLinks.size, queued, errors }
}

/** Birden fazla scraper source'u paralel çalıştır (max concurrency 4) */
export async function runScraperSources(
  sources: ScraperSource[]
): Promise<NewsroomRunResult> {
  const result = emptyNewsroomResult('local-news')
  const started = Date.now()

  // Run in batches of 4 to avoid overwhelming the network
  const CONCURRENCY = 4
  for (let i = 0; i < sources.length; i += CONCURRENCY) {
    const batch = sources.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(batch.map(s => runSingleScraperSource(s)))

    for (const r of results) {
      result.sourcesChecked++
      if (r.status === 'fulfilled') {
        result.itemsFetched += r.value.fetched
        result.itemsNew += r.value.queued
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
