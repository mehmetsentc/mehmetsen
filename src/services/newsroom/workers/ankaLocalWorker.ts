/**
 * ANKA Local Worker — Anka Haber Ajansı Yerel Haberler Scraper
 *
 * Türkiye saatiyle 06:00, 16:00, 18:00 ve 00:00'da çalışır.
 * ankahaber.net/kategori/yerel-haberler sayfasından son 6 saatin
 * yerel haberlerini çeker, her haberin içerik sayfasına girerek
 * tam metin + görsel + varsa video alır, Firestore'a yazar.
 *
 * Akış:
 *   1. ankahaber.net/kategori/yerel-haberler HTML → makale URL listesi
 *   2. Her URL → JSON-LD + <article> paragrafları
 *   3. publishedAt < 6 saat filtresi
 *   4. fingerprint dedup → Firestore `news` koleksiyonuna yaz
 */

import * as cheerio from 'cheerio'
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'
import { extractCityFromText } from '@/services/newsroom/geoEngine'
import { normalizeCitySlug } from '@/constants/cities'
import { publishScraperViaPipeline } from '@/services/newsroom/scraperPublishHelper'

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  Referer: 'https://www.google.com/',
}

const FETCH_TIMEOUT_MS = 15_000
const MAX_HTML_BYTES = 500_000
const MAX_AGE_MS = 6 * 60 * 60 * 1000   // 6 saat
const MAX_ARTICLES = 30
const CONCURRENCY = 4

interface AnkaLocalArticle {
  ankaId: string
  url: string
  title: string
  spot: string
  content: string
  thumbnail: string
  videoUrl: string       // YouTube watch URL veya MP4
  videoEmbedUrl: string  // iframe için embed URL
  publishedAt: number
  keywords: string[]
}

// ── Slug ──────────────────────────────────────────────────────────────────────
function buildSlug(title: string, idSuffix: string): string {
  return (
    title
      .toLowerCase()
      .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
      .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 80) +
    '-' +
    idSuffix
  )
}

// ── HTML fetch ─────────────────────────────────────────────────────────────────
async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) return null

    const reader = res.body?.getReader()
    if (!reader) return null

    let html = ''
    let bytes = 0
    const dec = new TextDecoder('utf-8', { fatal: false })
    while (bytes < MAX_HTML_BYTES) {
      const { done, value } = await reader.read()
      if (done) break
      html += dec.decode(value, { stream: true })
      bytes += value?.length ?? 0
    }
    reader.cancel()
    return html.length > 500 ? html : null
  } catch {
    return null
  }
}

// ── Liste sayfasından makale URL'lerini çıkar ──────────────────────────────────
function extractArticleUrls(html: string): string[] {
  const matches = [...html.matchAll(/href="(\/haber\/[a-z0-9-]+-[0-9a-f]{8})"/g)]
  return [...new Set(matches.map(m => 'https://ankahaber.net' + m[1]))]
}

// ── JSON-LD NewsArticle çıkar ──────────────────────────────────────────────────
function parseJsonLd(html: string): Record<string, unknown> | null {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)]
  for (const block of blocks) {
    try {
      const obj = JSON.parse(block[1]) as Record<string, unknown>
      if (obj['@type'] === 'NewsArticle' || obj['@type'] === 'Article') return obj
    } catch { /* skip */ }
  }
  return null
}

// ── Cheerio ile makale içeriğini çıkar ───────────────────────────────────────
const ANKA_CONTENT_SELECTORS = [
  'article',
  '[class*="article-body"]', '[class*="articleBody"]',
  '[class*="haber-icerik"]', '[class*="haberIcerik"]',
  '[class*="haber-detay"]', '[class*="haberDetay"]',
  '[class*="news-content"]', '[class*="newsContent"]',
  '[class*="story-body"]',  '[class*="storyBody"]',
  '[class*="post-content"]', '[class*="postContent"]',
  '[class*="entry-content"]',
  'main',
]

const ANKA_NOISE_SELECTORS = [
  'nav', 'header', 'footer', 'aside',
  '[class*="sidebar"]', '[class*="related"]', '[class*="recommended"]',
  '[class*="popular"]', '[class*="most-read"]', '[class*="en-cok"]',
  '[class*="share"]', '[class*="social"]', '[class*="tag"]',
  '[class*="banner"]', '[class*="ad"]', 'script', 'style', 'noscript',
]

function extractArticleBody(html: string): string {
  const $ = cheerio.load(html)

  $(ANKA_NOISE_SELECTORS.join(',')).remove()

  let bestText = ''

  for (const sel of ANKA_CONTENT_SELECTORS) {
    try {
      const $el = $(sel).first()
      if (!$el.length) continue

      const paragraphs = $el.find('p')
        .map((_i, el) => $(el).text().replace(/\s{2,}/g, ' ').trim())
        .get()
        .filter(t => t.length > 30)

      const joined = paragraphs.join('\n\n')
      if (joined.length > bestText.length) bestText = joined
      if (joined.length > 500) break
    } catch { /* selector hatası, sonrakine geç */ }
  }

  if (bestText.length < 100) {
    const paragraphs = $('p')
      .map((_i, el) => $(el).text().replace(/\s{2,}/g, ' ').trim())
      .get()
      .filter(t => t.length > 40)
    bestText = paragraphs.join('\n\n')
  }

  return bestText
}

// ── Video URL'si çıkar (YouTube-nocookie embed + MP4) ─────────────────────────
function extractVideo(html: string): { watchUrl: string; embedUrl: string } | null {
  const ytId = html.match(
    /(?:youtube-nocookie\.com\/embed\/|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )?.[1]
  if (ytId) {
    return {
      watchUrl: `https://www.youtube.com/watch?v=${ytId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}`,
    }
  }
  const mp4 = html.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/i)?.[1]
  if (mp4) return { watchUrl: mp4, embedUrl: mp4 }
  return null
}

// ── Tek makaleyi scrape et ────────────────────────────────────────────────────
async function scrapeArticle(url: string): Promise<AnkaLocalArticle | null> {
  const html = await fetchHtml(url)
  if (!html) return null

  const ld = parseJsonLd(html)
  if (!ld || !ld.headline) return null

  const title = String(ld.headline || '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim()
  if (!title) return null

  const rawImg  = Array.isArray(ld.image) ? ld.image[0] : ld.image
  const thumbnail = typeof rawImg === 'string'
    ? rawImg
    : (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ?? '')

  const content   = extractArticleBody(html) || String(ld.description || '').trim()
  const spot      = String(ld.description || '').trim()
  const video         = extractVideo(html)
  const videoUrl      = video?.watchUrl ?? ''
  const videoEmbedUrl = video?.embedUrl ?? ''
  const keywords  = String(ld.keywords || '').split(',').map(k => k.trim()).filter(Boolean)
  const publishedAt = ld.datePublished ? new Date(String(ld.datePublished)).getTime() : Date.now()
  const ankaId    = url.match(/-([0-9a-f]{8})$/)?.[1] ?? String(Date.now())

  return { ankaId, url, title, spot, content, thumbnail, videoUrl, videoEmbedUrl, publishedAt, keywords }
}

// ── Firestore'a yaz ───────────────────────────────────────────────────────────
async function publishArticle(
  db: FirebaseFirestore.Firestore,
  article: AnkaLocalArticle
): Promise<'published' | 'queued' | 'skipped' | 'error'> {
  const slug = buildSlug(article.title, article.ankaId)

  const cityText = `${article.title} ${article.spot} ${article.content.slice(0, 500)}`
  const detectedCity = extractCityFromText(cityText)
  const detectedCitySlug = detectedCity
    ? normalizeCitySlug(
        detectedCity
          .toLocaleLowerCase('tr-TR')
          .replace(/ğ/g, 'g')
          .replace(/ü/g, 'u')
          .replace(/ş/g, 's')
          .replace(/ı/g, 'i')
          .replace(/ö/g, 'o')
          .replace(/ç/g, 'c')
      )
    : ''

  const status = await publishScraperViaPipeline(db, article, {
    docId: `anka-local-${article.ankaId}`,
    fingerprint: `anka-local-${article.ankaId}`,
    editorId: 'anka-local',
    editorType: 'local',
    sourceLabel: 'Anka Haber Ajansı',
    preferredSlug: slug,
    forcedCategoryId: 'yerel-haber',
    ...(detectedCity ? { forcedCity: detectedCity } : {}),
    ...(detectedCitySlug ? { forcedCitySlug: detectedCitySlug } : {}),
    extraTags: article.keywords,
  })

  if (status === 'published' || status === 'updated') return 'published'
  if (status === 'queued' || status === 'draft') return 'queued'
  if (status === 'skipped') return 'skipped'
  return 'error'
}

// ── Ana worker ────────────────────────────────────────────────────────────────
export async function runAnkaLocalWorker(): Promise<NewsroomRunResult> {
  const result = emptyNewsroomResult('anka-local')
  const db = getAdminFirestore()
  const now = Date.now()
  const cutoff = now - MAX_AGE_MS

  const listHtml = await fetchHtml('https://ankahaber.net/kategori/yerel-haberler')
  if (!listHtml) {
    result.errors.push('ANKA yerel haberler liste sayfası çekilemedi')
    return result
  }

  const urls = extractArticleUrls(listHtml).slice(0, MAX_ARTICLES)
  console.log(`[ankaLocal] ${urls.length} URL bulundu`)
  result.sourcesChecked = 1
  result.itemsFetched   = urls.length

  let published = 0, skipped = 0, failed = 0, queued = 0

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch    = urls.slice(i, i + CONCURRENCY)
    const articles = await Promise.all(batch.map(scrapeArticle))

    for (const article of articles) {
      if (!article) { failed++; continue }

      if (article.publishedAt < cutoff) {
        console.log(`[ankaLocal] Eski haber atlandı: ${article.title.slice(0, 50)}`)
        skipped++
        continue
      }

      const status = await publishArticle(db, article)
      if (status === 'published') {
        published++
        console.log(`[ankaLocal] ✅ ${article.title.slice(0, 60)}`)
      } else if (status === 'queued') {
        queued++
      } else if (status === 'skipped') {
        skipped++
      } else {
        failed++
        result.errors.push(`Write failed: ${article.url}`)
      }
    }
  }

  result.itemsNew      = published + queued
  result.itemsSkipped  = skipped
  result.itemsFailed   = failed
  result.autoPublished = published
  result.durationMs    = Date.now() - now

  console.log(`[ankaLocal] Tamamlandı — yayınlandı:${published} kuyruk:${queued} atlandı:${skipped} hata:${failed}`)
  return result
}
