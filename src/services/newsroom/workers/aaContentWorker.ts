/**
 * AA Content Worker — Anadolu Ajansı Gündem İçerik Scraper
 *
 * Her saat başı çalışır. aa.com.tr/tr/gundem sayfasından son 1 saatin
 * haberlerini çeker, her haberin içerik sayfasına girerek tam metni ve
 * görseli alır, doğrudan Firestore'a yazar.
 *
 * Akış:
 *   1. aa.com.tr/tr/gundem HTML → makale URL listesi
 *   2. Her URL → JSON-LD (NewsArticle) ile başlık + içerik + görsel
 *   3. publishedAt < 1 saat filtresi
 *   4. fingerprint dedup → Firestore `news` koleksiyonuna yaz
 */

import { getAdminFirestore } from '@/lib/firebase/admin'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'

const FETCH_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'tr-TR,tr;q=0.9',
  Referer: 'https://www.google.com/',
}

const FETCH_TIMEOUT_MS = 15_000
const MAX_HTML_BYTES = 500_000
const MAX_AGE_MS = 2 * 60 * 60 * 1000   // 2 saat (saat başı çalıştığı için biraz marj)
const MAX_ARTICLES = 30
const CONCURRENCY = 4

interface AAArticle {
  aaId: string
  url: string
  title: string
  spot: string
  content: string
  thumbnail: string
  publishedAt: number   // ms
}

// ── Slug ─────────────────────────────────────────────────────────────────────
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

// ── HTML fetch ────────────────────────────────────────────────────────────────
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

// ── Liste sayfasından makale URL'lerini çıkar ─────────────────────────────────
function extractArticleUrls(html: string): string[] {
  const matches = [
    ...html.matchAll(/href="(\/tr\/gundem\/[^"]+\/\d{6,})"/g),
  ]
  const urls = [...new Set(matches.map(m => 'https://www.aa.com.tr' + m[1]))]
  return urls.filter(u => !u.includes('foto-') && !u.includes('video-'))
}

// ── JSON-LD NewsArticle çıkar ─────────────────────────────────────────────────
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

// ── Tek makaleyi scrape et ────────────────────────────────────────────────────
async function scrapeArticle(url: string): Promise<AAArticle | null> {
  const html = await fetchHtml(url)
  if (!html) return null

  const ld = parseJsonLd(html)
  if (!ld || !ld.headline) return null

  const title = String(ld.headline || '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&')
  if (!title) return null

  // Görsel — JSON-LD'den al, yoksa OG meta
  const rawImg = Array.isArray(ld.image) ? ld.image[0] : ld.image
  const imgUrl = typeof rawImg === 'string'
    ? rawImg
    : (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ?? '')

  // İçerik — articleBody yoksa description
  const content = String(ld.articleBody || ld.description || '').trim()
  const spot    = String(ld.description || '').trim()

  // Yayın tarihi — AA datePublished timezone içermez (örn: "2026-06-17T12:29:26.787")
  // Node.js bunu UTC olarak yorumlar, oysa gerçekte Türkiye saatidir (UTC+3).
  // +03:00 ekleyerek doğru UTC timestamp'e çeviriyoruz.
  const rawDateStr = String(ld.datePublished || '')
  const dateStr = rawDateStr && !rawDateStr.includes('+') && !rawDateStr.endsWith('Z')
    ? rawDateStr + '+03:00'
    : rawDateStr
  const publishedAt = dateStr ? new Date(dateStr).getTime() : Date.now()

  const aaId = url.match(/\/(\d{6,})$/)?.[1] ?? String(Date.now())

  return { aaId, url, title, spot, content, thumbnail: imgUrl, publishedAt }
}

// ── Firestore'a yaz ───────────────────────────────────────────────────────────
async function publishArticle(
  db: FirebaseFirestore.Firestore,
  article: AAArticle
): Promise<'published' | 'skipped' | 'error'> {
  try {
    const docId = `aa-${article.aaId}`

    const existing = await db.collection('news').doc(docId).get()
    if (existing.exists) return 'skipped'

    const slug = buildSlug(article.title, article.aaId.slice(-6))
    const now  = Date.now()

    await db.collection('news').doc(docId).set({
      title:           article.title,
      spot:            article.spot,
      content:         article.content,
      summary:         article.spot,
      thumbnail:       article.thumbnail,
      coverImageUrl:   article.thumbnail,
      status:          'published',
      category:        'gundem',
      categoryId:      'gundem',
      source:          'aa',
      sourceLabel:     'Anadolu Ajansı',
      sourceUrl:       article.url,
      slug,
      url:             `https://www.nahaber.com/haber/${slug}`,
      publishedAt:     article.publishedAt,
      createdAt:       now,
      updatedAt:       now,
      confidenceScore: 80,
      type:            'news',
      hasVideo:        false,
      socialPublished: false,
      fingerprint:     `aa-${article.aaId}`,
      editorType:      'aa-content',
    })

    return 'published'
  } catch (err) {
    console.error('[aaContent] write error:', err)
    return 'error'
  }
}

// ── Ana worker ────────────────────────────────────────────────────────────────
export async function runAaContentWorker(): Promise<NewsroomRunResult> {
  const result = emptyNewsroomResult('aa-content')
  const db = getAdminFirestore()
  const now = Date.now()
  const cutoff = now - MAX_AGE_MS

  // 1 — Liste sayfasını çek (gündem ana sayfa)
  const listHtml = await fetchHtml('https://www.aa.com.tr/tr/gundem')
  if (!listHtml) {
    result.errors.push('AA gündem liste sayfası çekilemedi')
    return result
  }

  const urls = extractArticleUrls(listHtml).slice(0, MAX_ARTICLES)
  console.log(`[aaContent] ${urls.length} URL bulundu`)
  result.sourcesChecked = 1
  result.itemsFetched = urls.length

  // 2 — Makaleleri paralel çek (CONCURRENCY=4)
  let published = 0, skipped = 0, failed = 0

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY)
    const articles = await Promise.all(batch.map(scrapeArticle))

    for (const article of articles) {
      if (!article) { failed++; continue }

      // Son 2 saatten eski ise atla
      if (article.publishedAt < cutoff) {
        console.log(`[aaContent] Eski haber atlandı: ${article.title.slice(0, 50)}`)
        skipped++
        continue
      }

      const status = await publishArticle(db, article)
      if (status === 'published') {
        published++
        console.log(`[aaContent] ✅ ${article.title.slice(0, 60)}`)
      } else if (status === 'skipped') {
        skipped++
      } else {
        failed++
        result.errors.push(`Write failed: ${article.url}`)
      }
    }
  }

  result.itemsNew       = published
  result.itemsSkipped   = skipped
  result.itemsFailed    = failed
  result.autoPublished  = published
  result.durationMs     = Date.now() - now

  console.log(`[aaContent] Tamamlandı — yayınlandı:${published} atlandı:${skipped} hata:${failed}`)
  return result
}
