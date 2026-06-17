/**
 * ANKA Breaking Worker — Anka Haber Ajansı Son Dakika Scraper
 *
 * Her 10 dakikada bir çalışır.
 * ankahaber.net/kategori/sondakika sayfasından son 10 dakikanın
 * haberlerini çeker, her haberin içerik sayfasına girerek tam metin,
 * görsel ve varsa video alır, son-dakika olarak Firestore'a yazar.
 *
 * Akış:
 *   1. ankahaber.net/kategori/sondakika HTML → makale URL listesi
 *   2. Her URL → JSON-LD + <article> paragrafları ile başlık + içerik + görsel
 *   3. publishedAt < 15 dakika filtresi (10dk cron + 5dk marj)
 *   4. fingerprint dedup → Firestore `news` koleksiyonuna son-dakika olarak yaz
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
const MAX_AGE_MS = 15 * 60 * 1000   // 15 dakika (10dk cron + 5dk marj)
const MAX_ARTICLES = 20
const CONCURRENCY = 4

interface AnkaArticle {
  ankaId: string     // URL'deki 8 haneli hex ID
  url: string
  title: string
  spot: string
  content: string
  thumbnail: string
  videoUrl: string       // YouTube watch URL veya MP4
  videoEmbedUrl: string  // iframe için embed URL
  publishedAt: number    // ms
  keywords: string[]
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
    ...html.matchAll(/href="(\/haber\/[a-z0-9-]+-[0-9a-f]{8})"/g),
  ]
  const urls = [...new Set(matches.map(m => 'https://ankahaber.net' + m[1]))]
  return urls
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

// ── <article> paragraflarından içerik çıkar ───────────────────────────────────
function extractArticleBody(html: string): string {
  // <article> bloğunu bul
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)
  const articleHtml = articleMatch ? articleMatch[1] : html

  // <p> etiketlerini çıkar, HTML tag'larını temizle
  const paragraphs = [...articleHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map(m => m[1]
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/\s{2,}/g, ' ')
      .trim()
    )
    .filter(t => t.length > 30)

  return paragraphs.join('\n\n')
}

// ── Video URL'si çıkar (YouTube embed + MP4) ──────────────────────────────────
function extractVideo(html: string): { watchUrl: string; embedUrl: string } | null {
  // youtube-nocookie.com/embed/{id}  veya  youtube.com/embed/{id}  veya  youtu.be/{id}
  const ytId = html.match(
    /(?:youtube-nocookie\.com\/embed\/|youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  )?.[1]
  if (ytId) {
    return {
      watchUrl: `https://www.youtube.com/watch?v=${ytId}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${ytId}`,
    }
  }
  // Doğrudan MP4
  const mp4 = html.match(/<source[^>]+src="([^"]+\.mp4[^"]*)"/i)?.[1]
  if (mp4) return { watchUrl: mp4, embedUrl: mp4 }

  return null
}

// ── Tek makaleyi scrape et ────────────────────────────────────────────────────
async function scrapeArticle(url: string): Promise<AnkaArticle | null> {
  const html = await fetchHtml(url)
  if (!html) return null

  const ld = parseJsonLd(html)
  if (!ld || !ld.headline) return null

  const title = String(ld.headline || '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim()
  if (!title) return null

  // Görsel — JSON-LD image array → ilk eleman
  const rawImg = Array.isArray(ld.image) ? ld.image[0] : ld.image
  const thumbnail = typeof rawImg === 'string'
    ? rawImg
    : (html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ?? '')

  // İçerik — <article> paragrafları, fallback: description
  const content = extractArticleBody(html) || String(ld.description || '').trim()
  const spot    = String(ld.description || '').trim()

  // Video — youtube-nocookie embed veya MP4
  const video = extractVideo(html)
  const videoUrl      = video?.watchUrl ?? ''
  const videoEmbedUrl = video?.embedUrl ?? ''

  // Keywords
  const keywordsRaw = String(ld.keywords || '')
  const keywords = keywordsRaw ? keywordsRaw.split(',').map(k => k.trim()).filter(Boolean) : []

  // Yayın tarihi
  const dateStr    = String(ld.datePublished || '')
  const publishedAt = dateStr ? new Date(dateStr).getTime() : Date.now()

  // 8 haneli hex ANKA ID — URL'nin son parçasından
  const ankaId = url.match(/-([0-9a-f]{8})$/)?.[1] ?? String(Date.now())

  return { ankaId, url, title, spot, content, thumbnail, videoUrl, videoEmbedUrl, publishedAt, keywords }
}

// ── Firestore'a yaz ───────────────────────────────────────────────────────────
async function publishArticle(
  db: FirebaseFirestore.Firestore,
  article: AnkaArticle
): Promise<'published' | 'skipped' | 'error'> {
  try {
    const docId = `anka-breaking-${article.ankaId}`

    const existing = await db.collection('news').doc(docId).get()
    if (existing.exists) return 'skipped'

    const slug = buildSlug(article.title, article.ankaId)
    const now  = Date.now()

    const doc: Record<string, unknown> = {
      title:           article.title,
      spot:            article.spot,
      content:         article.content,
      summary:         article.spot,
      thumbnail:       article.thumbnail,
      coverImageUrl:   article.thumbnail,
      status:          'published',
      category:        'son-dakika',
      categoryId:      'son-dakika',
      source:          'anka-haber',
      sourceLabel:     'Anka Haber Ajansı',
      sourceUrl:       article.url,
      slug,
      url:             `https://www.nahaber.com/haber/${slug}`,
      publishedAt:     article.publishedAt,
      createdAt:       now,
      updatedAt:       now,
      confidenceScore: 85,
      type:            'news',
      isBreaking:      true,
      breakingScore:   90,
      hasVideo:        !!article.videoUrl,
      socialPublished: false,
      fingerprint:     `anka-breaking-${article.ankaId}`,
      editorType:      'anka-breaking',
    }

    if (article.videoUrl) {
      doc.videoUrl      = article.videoUrl
      doc.videoEmbedUrl = article.videoEmbedUrl
    }
    if (article.keywords.length) doc.tags = article.keywords

    await db.collection('news').doc(docId).set(doc)
    return 'published'
  } catch (err) {
    console.error('[ankaBreaking] write error:', err)
    return 'error'
  }
}

// ── Ana worker ────────────────────────────────────────────────────────────────
export async function runAnkaBreakingWorker(): Promise<NewsroomRunResult> {
  const result = emptyNewsroomResult('anka-breaking')
  const db = getAdminFirestore()
  const now = Date.now()
  const cutoff = now - MAX_AGE_MS

  // 1 — Son dakika kategori sayfasını çek
  const listHtml = await fetchHtml('https://ankahaber.net/kategori/sondakika')
  if (!listHtml) {
    result.errors.push('ANKA son-dakika liste sayfası çekilemedi')
    return result
  }

  const urls = extractArticleUrls(listHtml).slice(0, MAX_ARTICLES)
  console.log(`[ankaBreaking] ${urls.length} URL bulundu`)
  result.sourcesChecked = 1
  result.itemsFetched = urls.length

  // 2 — Makaleleri paralel çek (CONCURRENCY=4)
  let published = 0, skipped = 0, failed = 0

  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY)
    const articles = await Promise.all(batch.map(scrapeArticle))

    for (const article of articles) {
      if (!article) { failed++; continue }

      // Son 15 dakikadan eski ise atla
      if (article.publishedAt < cutoff) {
        console.log(`[ankaBreaking] Eski haber atlandı: ${article.title.slice(0, 50)}`)
        skipped++
        continue
      }

      const status = await publishArticle(db, article)
      if (status === 'published') {
        published++
        console.log(`[ankaBreaking] 🚨 ${article.title.slice(0, 60)}`)
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

  console.log(`[ankaBreaking] Tamamlandı — yayınlandı:${published} atlandı:${skipped} hata:${failed}`)
  return result
}
