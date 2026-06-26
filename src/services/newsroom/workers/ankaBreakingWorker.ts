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

import * as cheerio from 'cheerio'
import { getAdminFirestore } from '@/lib/firebase/admin'
import type { NewsroomRunResult } from '@/services/newsroom/types'
import { emptyNewsroomResult } from '@/services/newsroom/types'
import { extractCityFromText } from '@/services/newsroom/geoEngine'
import { normalizeCitySlug } from '@/constants/cities'
import { classifyArticleCategory } from '@/services/newsroom/aiCategoryClassifier'

/**
 * BEYAZ LİSTE: SADECE bu kategoriler son-dakika olabilir.
 *
 * ÖNEMLI: 'gundem' bu listede YOK. Nedeni:
 *   aiCategoryClassifier'daki gundem tanımı "belediye, yerel yönetim, sosyal" gibi
 *   yerel haberleri de kapsar. gundem → TRULY_BREAKING olursa belediye haberleri
 *   son-dakikaya sızar. gundem için ek kontrol: deprem/patlama/yangın gibi
 *   acil keyword varsa son-dakika, yoksa → demote.
 *
 * Siyaset için ek kural: şehir tespiti yoksa (ulusal siyaset) son-dakika olabilir.
 * Şehir tespiti varsa (belediye haberi, yerel siyaset) → demote.
 */
const TRULY_BREAKING_CATEGORIES = new Set([
  // 'gundem' kasıtlı olarak ÇIKARILDI — AI gundem tanımı belediye/yerel haberleri kapsar
  'dunya',         // Uluslararası gelişmeler: savaş, büyük olay
  'ekonomi',       // Büyük ekonomik kriz, piyasa çöküşü, merkez bankası kararı
  'saglik',        // Salgın, büyük halk sağlığı krizi, salgın uyarısı
  'meteoroloji',   // Fırtına, sel, kar felaketi (birden fazla ili etkileyen)
])

/** gundem için ek acil kontrol — TRULY_BREAKING_CATEGORIES'e eklemek yerine ayrı. */
const GUNDEM_BREAKING_KEYWORDS = [
  'deprem', 'patlama', 'yangın', 'yangin', 'sel', 'heyelan', 'tsunami',
  'saldırı', 'saldiri', 'terör', 'teror', 'suikast', 'darbe',
  'can kaybı', 'can kaybi', 'ölü', 'yaralı', 'enkaz', 'göçük',
  'fırtına', 'hortum', 'afet', 'acil durum', 'olağanüstü hal',
  'nükleer', 'kimyasal', 'biyolojik tehdit',
] as const

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

// ── Cheerio ile makale içeriğini çıkar ───────────────────────────────────────
// ANKA Next.js SSR sayfasında <article> etiketi olmayabilir.
// Önce bilinen content selector'larını dener, bulamazsa tüm <p> bloklarını tarar.
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

  // Gürültülü elementleri kaldır
  $(ANKA_NOISE_SELECTORS.join(',')).remove()

  // İçerik selector'larını sırayla dene — en fazla <p> içereni al
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
      if (joined.length > 500) break   // yeterince iyi, dur
    } catch { /* selector hatası, sonrakine geç */ }
  }

  // Hiçbir selector tutmadıysa tüm sayfadan <p> topla
  if (bestText.length < 100) {
    const paragraphs = $('p')
      .map((_i, el) => $(el).text().replace(/\s{2,}/g, ' ').trim())
      .get()
      .filter(t => t.length > 40)
    bestText = paragraphs.join('\n\n')
  }

  return bestText
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

    // Şehir tespiti — başlık + içerikten otomatik bul
    const cityText = `${article.title} ${article.spot} ${article.content.slice(0, 500)}`
    const detectedCity = extractCityFromText(cityText)
    const detectedCitySlug = detectedCity ? normalizeCitySlug(
      detectedCity.toLocaleLowerCase('tr-TR')
        .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
        .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    ) : ''

    // ── Son-dakika uygunluk kontrolü (BEYAZ LİSTE) ──────────────────────────
    // Anka'nın son-dakika sayfası her şeyi son-dakika olarak işaret eder.
    // BEYAZ LİSTE: Sadece TRULY_BREAKING_CATEGORIES son-dakika olabilir.
    // Siyaset için ek kural: şehir tespiti yoksa ulusal siyaset → kabul.
    //   Şehir tespiti varsa yerel siyaset (belediye haberi) → demote.
    let finalCategory    = 'son-dakika'
    let finalIsBreaking  = true
    let finalBreakingScore = 90

    try {
      const aiResult = await classifyArticleCategory(
        article.title,
        `${article.spot}\n${article.content}`,
        'son-dakika'
      )

      if (aiResult) {
        const aiCategory = aiResult.categoryId
        const titleLower = article.title.toLocaleLowerCase('tr-TR')
        const contentLower = `${article.spot} ${article.content.slice(0, 300)}`.toLocaleLowerCase('tr-TR')
        const combinedText = `${titleLower} ${contentLower}`

        if (TRULY_BREAKING_CATEGORIES.has(aiCategory)) {
          // ✅ Ulusal/küresel kapsam (dunya, ekonomi, saglik, meteoroloji) — son-dakika
          console.log(`[ankaBreaking] 🚨 Son-dakika (${aiCategory}): "${article.title.slice(0, 55)}"`)

        } else if (aiCategory === 'gundem' && !detectedCity && GUNDEM_BREAKING_KEYWORDS.some(kw => combinedText.includes(kw))) {
          // ✅ Ulusal acil gündem: deprem/patlama/yangın/saldırı + şehir tespit edilmedi
          console.log(`[ankaBreaking] 🚨 Son-dakika (acil-gundem): "${article.title.slice(0, 55)}"`)

        } else if (aiCategory === 'siyaset' && !detectedCity) {
          // ✅ Ulusal siyaset (şehir yok: TBMM, Cumhurbaşkanı, Bakan, MEB vb.)
          console.log(`[ankaBreaking] 🚨 Son-dakika (ulusal siyaset): "${article.title.slice(0, 55)}"`)

        } else {
          // ❌ Demote: belediye/yerel gundem / yerel siyaset / spor / kültür / teknoloji / magazin / vb.
          // Şehir tespiti varsa yerel-haber; yoksa AI kategorisi (ör. spor, teknoloji)
          finalCategory    = detectedCity ? 'yerel-haber' : aiCategory
          finalIsBreaking  = false
          finalBreakingScore = 35
          console.log(
            `[ankaBreaking] ⬇️  Demote (AI=${aiCategory}, şehir=${detectedCity ?? 'yok'}): ` +
            `"${article.title.slice(0, 55)}" → ${finalCategory}`
          )
        }
      } else {
        // aiResult null — AI dönmedi veya güven düşük.
        // GÜVENSİZ FALLBACK (eski: son-dakika) kaldırıldı.
        // Acil keyword yoksa gundem olarak yayınla; varsa son-dakika.
        const titleLower = article.title.toLocaleLowerCase('tr-TR')
        const hasUrgentKeyword = GUNDEM_BREAKING_KEYWORDS.some(kw => titleLower.includes(kw))
        if (!hasUrgentKeyword || detectedCity) {
          finalCategory    = detectedCity ? 'yerel-haber' : 'gundem'
          finalIsBreaking  = false
          finalBreakingScore = 40
          console.log(`[ankaBreaking] AI null → güvenli demote: "${article.title.slice(0, 55)}" → ${finalCategory}`)
        } else {
          console.log(`[ankaBreaking] AI null + acil keyword → son-dakika: "${article.title.slice(0, 55)}"`)
        }
      }
    } catch {
      // AI hatası → acil keyword yoksa güvenli taraf: gundem olarak yayınla
      const titleLower = article.title.toLocaleLowerCase('tr-TR')
      const hasUrgentKeyword = GUNDEM_BREAKING_KEYWORDS.some(kw => titleLower.includes(kw))
      if (!hasUrgentKeyword || detectedCity) {
        finalCategory    = detectedCity ? 'yerel-haber' : 'gundem'
        finalIsBreaking  = false
        finalBreakingScore = 40
      }
      console.warn(`[ankaBreaking] AI hatası → ${finalCategory}: "${article.title.slice(0, 55)}"`)
    }
    // ────────────────────────────────────────────────────────────────────────

    const doc: Record<string, unknown> = {
      title:           article.title,
      spot:            article.spot,
      content:         article.content,
      summary:         article.spot,
      thumbnail:       article.thumbnail,
      coverImageUrl:   article.thumbnail,
      status:          'published',
      category:        finalCategory,
      categoryId:      finalCategory,
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
      isBreaking:      finalIsBreaking,
      breakingScore:   finalBreakingScore,
      hasVideo:        !!article.videoUrl,
      socialPublished: false,
      fingerprint:     `anka-breaking-${article.ankaId}`,
      editorType:      'anka-breaking',
      ...(detectedCity     ? { city: detectedCity, cityName: detectedCity } : {}),
      ...(detectedCitySlug ? { citySlug: detectedCitySlug } : {}),
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
