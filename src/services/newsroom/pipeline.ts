/**
 * Newsroom pipeline: source → extract → AI rewrite → fact-check → dedupe → category/geo → AUTO publish.
 * newsDrafts when confidence below threshold, moderation review, DRAFT_ONLY persona, or hard failures.
 *
 * EXTRACTION STAGE (new):
 *   When baseWorker queues items with thin RSS content (<500 chars),
 *   pipeline fetches the full article before sending to AI.
 *   GPT fallback used when extraction fails (blocked sites).
 */
import type { Firestore } from 'firebase-admin/firestore'
import { cityCategoryId, slugifyCity, type PostLocation } from '@/lib/location'
import { getCityCategoryName, normalizeCitySlug } from '@/constants/cities'
import { Collections } from '@/lib/firebase/admin'
import { aiNewsEditor, type AiRewriteResult } from '@/services/aiNewsEditor'
import { geminiEditArticle, isGeminiConfigured } from '@/lib/ai/gemini'
import {
  NEWSROOM_AUTO_PUBLISH_THRESHOLD,
  NEWSROOM_LOW_CONFIDENCE_THRESHOLD,
  NEWSROOM_REWRITE_MAX_RETRIES,
  NEWSROOM_RETRY_CONFIDENCE_RELAX,
} from '@/services/newsroom/config'
import { runMultiStageEditor, type MultiStageResult } from '@/services/newsroom/editors/multiStageEditor'
import { moderateContent } from '@/services/moderationService'
import { newsDraftService } from '@/services/newsDraftService'
import {
  computeBreakingScore,
  queueBreakingPushNotification,
  resolveBreakingFlags,
} from '@/services/newsroom/breakingPriority'
import { categoryEngine } from '@/services/newsroom/categoryEngine'
import { classifyArticleCategory } from '@/services/newsroom/aiCategoryClassifier'
import { applyAstrologyCategoryOverride } from '@/lib/categoryOverrides'
import { findSimilarPublishedArticle } from '@/services/newsroom/dedupe/similarityEngine'
import { factChecker } from '@/services/newsroom/factChecker'
import { geoEngine } from '@/services/newsroom/geoEngine'
import { resolveCountryFromText } from '@/constants/countries'
import { fetchArticleEnrichment } from '@/services/rss/articleFetcher'
import { buildBodyBlocksFromAi } from '@/lib/articleBlocksFromAi'
import { articleBlocksToPlainText } from '@/lib/articleBlocks'
import { contentHasIncompleteSegments, titleLooksIncomplete } from '@/lib/ai/textCompleteness'
import { isNewsBodyTooShort, countPlainWords, MIN_NEWS_BODY_WORDS } from '@/lib/contentQuality'
import { routeAiEditor, authorFieldsFromEditor, aiEditorForcesDraft } from '@/lib/ai/editorial/editorRouter'
import { buildEditorPrompt } from '@/lib/ai/editorial/promptBuilder'
import { resolveModelForEditor, recordAiUsage } from '@/lib/ai/editorial/modelRouter'
import type { NewsroomArticleInput } from '@/services/newsroom/types'

/** Minimum total content length (chars) to proceed to AI rewrite. */
const QUALITY_MIN_CHARS = 500

/**
 * Sosyal medya tanıtım içerikleri tespiti.
 *
 * Bazı haber kaynakları (ANKA, AA vb.) RSS feed'lerine gerçek haber yerine
 * sosyal medya takip çağrısı yayınlar:
 *   "X oldu. 🚨Sosyal medya hesaplarımızı takip etmeyi unutmayın!
 *    WhatsApp: https://whatsapp.com/channel/... Bluesky: http://bsky.app/..."
 *
 * Bu tür içerikler haber değil reklam — pipeline'a girmeden atlanır.
 * Koşul: en az 1 güçlü sinyal VARSA + tanıtım metni çıkarıldıktan sonra
 * kalan içerik 200 karakterden kısaysa → promotional.
 */
function isPromotionalContent(title: string, content: string, summary?: string): boolean {
  const combined = `${title} ${content} ${summary ?? ''}`.toLowerCase()

  // Güçlü sinyaller — bunlardan herhangi biri yoksa hemen çık
  const strongSignals = [
    /sosyal medya hesap.*?takip/i,
    /hesaplar.*?takip etmeyi unutmay/i,
    /bizi takip etmeyi unutmay/i,
    /kanalımıza abone/i,
    /whatsapp\.com\/channel/i,
    /bsky\.app\/profile/i,
    /t\.me\/[a-zA-Z0-9_+]+/,      // Telegram kanal linki
  ]

  const hasStrongSignal = strongSignals.some(p => p.test(combined))
  if (!hasStrongSignal) return false

  // Tanıtım satırlarını çıkar, geriye ne kalıyor?
  const promoLineRx = /whatsapp|bluesky|bsky\.app|t\.me\/|sosyal medya|takip et|kanalımız|hesabımız|instagram|twitter|youtube\.com\/channel|telegram/i
  const lines = content.split(/[\n\r]+/).map(l => l.trim()).filter(Boolean)
  const nonPromo = lines.filter(l => !promoLineRx.test(l)).join(' ').trim()

  // Tanıtım çıkarıldıktan sonra 200 karakterden az içerik kaldıysa → tanıtım içeriği
  return nonPromo.length < 200
}

/**
 * Canlı yayın / live broadcast içerik tespiti.
 *
 * Bazı haber kaynakları (ANKA, AA, İHA vb.) canlı yayın linkleri ve
 * basın toplantısı duyurularını RSS ile gönderir. Bu içerikler gerçek
 * haber değil, canlı yayın yönlendirmesi olduğundan pipeline'a alınmaz.
 *
 * Başlık VEYA içerik/özette aşağıdaki desenlerin herhangi biri varsa → atlanır:
 *   "#Canlı", "canlı yayın", "basın toplantısı düzenliyor" + youtube linki vb.
 */
function isLiveBroadcastContent(title: string, content?: string, summary?: string): boolean {
  const t = title.toLowerCase().trim()
  const c = ((content ?? '') + ' ' + (summary ?? '')).toLowerCase()

  const CANLI_PATTERNS = [
    '#canlı', '# canlı', '#canli', '# canli',
    'canlı yayın', 'canli yayin', 'canlı takip',
    'canlıyayın', '#canlıyayın', 'canlı anlatım',
    'canlı blog', 'canlı izle', 'canlı izleyin',
    'ankacanlı', '#ankacanlı',
  ]

  // Başlıkta varsa → atla
  if (CANLI_PATTERNS.some(p => t.includes(p))) return true

  // İçerik/özette varsa → atla
  if (CANLI_PATTERNS.some(p => c.includes(p))) return true

  // "canlı" kelimesi başlıkta + yayın bağlamı
  if (t.includes('canlı') && (
    t.endsWith('#canlı') || t.endsWith('# canlı') ||
    t.includes('canlı yayın') || t.includes('yayın') ||
    t.startsWith('canlı')
  )) return true

  // "düzenleniyor/düzenliyor" + "canlı" kombinasyonu
  if ((t.includes('düzenleniyor') || t.includes('düzenliyor')) && t.includes('canlı')) return true

  // "basın toplantısı düzenliyor/yapıyor/gerçekleştiriyor" — canlı duyuru, haber değil
  // "düzenliyor/yapıyor" = şu an devam eden etkinlik; "düzenledi/yaptı" = geçmiş → haber
  if (t.includes('basın toplantısı') && (
    t.includes('düzenliyor') || t.includes('düzenleniyor') ||
    t.includes('yapıyor') || t.includes('yapılıyor') ||
    t.includes('gerçekleştiriyor') || t.includes('gerçekleştiriliyor') ||
    t.includes('veriyor') || t.includes('veriliyor')
  )) return true

  // Şu an devam eden etkinlik sinyalleri — canlı yayın yönlendirmesi
  // Not: "toplantısını yaptı", "açıklama yaptı" = geçmiş → haber, bu yüzden
  // sadece şimdiki zaman fiilleri + toplantı/konuşma bağlamında filtrele.
  if ((t.includes('açıklama yapıyor') || t.includes('konuşma yapıyor') ||
       t.includes('konuşuyor') || t.includes('açıklıyor')) &&
      (t.includes('toplantı') || t.includes('basın') || t.includes('konferans') ||
       c.includes('youtube.com') || c.includes('canlı'))) return true

  // YouTube video linki + canlı içeriği — yayın yönlendirmesi
  if (c.includes('youtube.com/watch') && (c.includes('canlı') || c.includes('canlıyayın'))) return true
  // YouTube embed/live stream — sadece video linki olan içerik
  if (c.includes('youtube.com/live') || c.includes('youtu.be/') && c.includes('canlı')) return true

  return false
}

/**
 * Detects RSS content truncated mid-sentence.
 *
 * RSS feeds routinely clip articles at 200-500 chars without a sentence
 * boundary — e.g. "Aziz Yıldırım ve yönetim k". We catch four patterns:
 *   1. Trailing ellipsis:  "…" / "..."
 *   2. Ends mid-word:      last char is a letter (Turkish or Latin)
 *   3. Ends with comma:    ","
 *   4. Ends with Turkish conjunctions hanging in air: " ve", " ile", " da", " de"
 *
 * When detected, the pipeline forces full-page extraction regardless of
 * the 500-char quality gate.
 */
function isTruncated(text: string): boolean {
  if (!text || text.length < 10) return false
  const t = text.trimEnd()

  // Pattern 1 — explicit ellipsis (HTML stripped) or soft truncation marker
  if (t.endsWith('…') || t.endsWith('...') || t.endsWith('[…]') || t.endsWith('[...]')) return true

  // Pattern 2 — ends mid-word (letter without following period/space/bracket)
  const lastChar = t[t.length - 1]
  if (lastChar && /[a-zA-ZğüşıöçĞÜŞİÖÇ0-9]/.test(lastChar)) return true

  // Pattern 3 — dangling comma or semicolon
  if (t.endsWith(',') || t.endsWith(';')) return true

  // Pattern 4 — trailing Turkish coordinating conjunctions / postpositions
  if (/\s(ve|ile|da|de|ya|ki|ama|fakat|lakin|ancak|çünkü|zira|hem|ne|veya|ya da)$/i.test(t)) return true

  return false
}

/**
 * @deprecated Bu fonksiyon artık kullanılmıyor.
 * Başlıktan haber üretmek uydurma/halüsinasyon içerik üretir.
 * İçerik yetersizse pipeline direkt 'skipped' döner.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateArticleFromHeadline(
  title: string,
  sourceLabel: string
): Promise<{ summary: string; content: string } | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'
  const baseUrl = 'https://api.deepseek.com/v1/chat/completions'

  const systemPrompt = `Sen NaHaber adlı Türkçe haber platformunun editörüsün.
Bir haber başlığı verilecek. Bu başlıktan yola çıkarak gerçekçi, bilgilendirici bir haber yaz.
KURALLAR:
- Türkçe, akıcı gazetecilik dili
- summary: 1-2 cümle bağlam özeti (max 160 karakter)
- content: 3-5 paragraf (150-350 kelime), giriş + olgular + arka plan
- Bilinmeyenleri "araştırılıyor", "henüz açıklanmadı" gibi ifadelerle belirt
- Sadece JSON: {"summary":"...","content":"..."}`

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.5,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Başlık: "${title}"\nKaynak: ${sourceLabel}\n\nHaberi yaz.` },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) return null
    const parsed = JSON.parse(raw) as { summary?: string; content?: string }
    const summary = parsed.summary?.trim() || ''
    const content = parsed.content?.trim() || ''
    if (content.length < 100) return null
    console.log(`[newsroom/pipeline] headline-to-article via DeepSeek: ${title.slice(0, 60)}`)
    return { summary, content }
  } catch {
    return null
  }
}

const NAHABER_AUTHOR = 'nahaber'
const NAHABER_AUTHOR_ID = 'nahaber'

// ── LANGUAGE DETECTION + TRANSLATION ────────────────────────────────────────

/**
 * Heuristic: Turkish text typically has ≥0.8% Turkish-specific characters.
 * English/other Latin text will have 0%.
 */
function looksLikeTurkish(text: string): boolean {
  if (!text || text.length < 30) return true // assume Turkish for very short text
  const letters = (text.match(/\p{L}/gu) ?? []).length
  if (letters < 20) return true
  const trChars = (text.match(/[ğüşıöçĞÜŞİÖÇ]/g) ?? []).length
  return trChars / letters > 0.008
}

/**
 * Translate non-Turkish title / summary / content to Turkish using GPT.
 * Called only for skipAiRewrite articles (trend, influencer) and as a guard.
 */
async function translateToTurkish(fields: {
  originalTitle: string
  originalSummary?: string
  originalContent?: string
}): Promise<{ originalTitle: string; originalSummary: string; originalContent: string } | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'
  const baseUrl = 'https://api.deepseek.com/v1/chat/completions'

  const contentSnippet = (fields.originalContent ?? '').slice(0, 3000)
  const summarySnippet = fields.originalSummary ?? ''

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        messages: [
          {
            role: 'system',
            content: `Sen profesyonel bir Türkçe çeviri editörüsün. Verilen İngilizce (ya da başka dildeki) haber içeriğini akıcı, doğal Türkçeye çevir. Gazetecilik dilini koru. Sadece JSON döndür: {"title":"...","summary":"...","content":"..."}`,
          },
          {
            role: 'user',
            content: `Başlık: ${fields.originalTitle}\nÖzet: ${summarySnippet}\nİçerik:\n${contentSnippet}\n\nTürkçeye çevir.`,
          },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) return null
    const parsed = JSON.parse(raw) as { title?: string; summary?: string; content?: string }
    const title = parsed.title?.trim() || fields.originalTitle
    const summary = parsed.summary?.trim() || summarySnippet
    const content = parsed.content?.trim() || contentSnippet
    if (content.length < 80) return null
    console.log(`[newsroom/pipeline] translated to Turkish via DeepSeek: ${title.slice(0, 60)}`)
    return { originalTitle: title, originalSummary: summary, originalContent: content }
  } catch (err) {
    console.warn('[newsroom/pipeline] translation failed:', err)
    return null
  }
}

/**
 * Gemini rewrite → AiRewriteResult dönüşümü.
 * Gemini daha zengin çıktı üretir (sosyal medya, SEO, quality score vb.)
 * Pipeline'ın beklediği AiRewriteResult formatına map edilir.
 */
async function rewriteWithGemini(input: {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  forcedCategoryId?: string
}): Promise<AiRewriteResult | null> {
  try {
    const result = await geminiEditArticle({
      sourceLabel: input.sourceLabel,
      originalTitle: input.originalTitle,
      originalSummary: input.originalSummary,
      originalContent: input.originalContent,
      sourceUrl: input.sourceUrl,
      enrichedContent: input.originalContent,
      forcedCategoryId: input.forcedCategoryId,
    })

    // city → normalize Turkish city name
    const cityRaw = result.location?.trim()
    const city = cityRaw && cityRaw.toLowerCase() !== 'null' ? cityRaw : null

    return {
      title: result.title,
      spot: result.spot || result.summary,
      summary: result.summary,
      description: result.content || result.description,
      seoTitle: result.metaTitle || result.title,
      seoDescription: result.metaDescription || result.summary,
      categoryId: result.category || 'gundem',
      categoryConfidence: result.aiConfidence ?? 80,
      isBreaking: result.isBreaking ?? false,
      city,
      district: null,
      country: result.country || 'Türkiye',
      tags: result.tags ?? [],
    }
  } catch (err) {
    console.warn('[pipeline] Gemini rewrite failed, falling back to OpenAI/DeepSeek:', err instanceof Error ? err.message : err)
    return null
  }
}

export type PipelineOutcome = 'created' | 'published' | 'updated' | 'skipped' | 'failed'

export interface PipelineStats {
  created: number
  published: number
  updated: number
  skipped: number
  failed: number
  lowConfidence: number
}

export interface PipelineOptions {
  changeType?: 'new' | 'updated'
  existingNewsId?: string
  queueJobId?: string
  /** Scraper worker'lar için sabit Firestore doc ID */
  targetNewsId?: string
  publishedAt?: number
  preferredSlug?: string
  /**
   * Mevcut newsDrafts belgesini yeniden işle.
   * Fingerprint skip atlanır; yayınlanırsa draft silinir, yine draft kalırsa güncellenir.
   */
  reprocessDraftId?: string
}

export interface PipelineResult {
  outcome: PipelineOutcome
  lowConfidence?: boolean
  newsId?: string
}

async function findExistingByFingerprint(
  db: Firestore,
  fingerprint: string
): Promise<{ id: string; collection: 'news' | 'newsDrafts' } | null> {
  const [newsSnap, draftSnap] = await Promise.all([
    db.collection(Collections.NEWS).where('rssFingerprint', '==', fingerprint).limit(1).get(),
    db.collection(Collections.NEWS_DRAFTS).where('rssFingerprint', '==', fingerprint).limit(1).get(),
  ])

  if (!newsSnap.empty) return { id: newsSnap.docs[0]!.id, collection: 'news' }
  if (!draftSnap.empty) return { id: draftSnap.docs[0]!.id, collection: 'newsDrafts' }
  return null
}

function toLocation(
  city: string | null,
  district: string | null,
  country: string
): PostLocation | null {
  if (!city?.trim()) return null
  const out: PostLocation = {
    city: city.trim(),
    country: country.trim() || 'Türkiye',
    lat: 0,
    lng: 0,
  }
  const districtValue = district?.trim()
  if (districtValue) out.district = districtValue
  return out
}

/** Son 48 saatte yayınlanan haberlerin başlıklarını çeker (AI duplikat tespiti için). */

async function appendEditHistory(
  db: Firestore,
  newsId: string,
  entry: {
    changeType: string
    title: string
    summary: string
    confidenceScore: number
    queueJobId?: string
  }
): Promise<void> {
  const now = Date.now()
  // Firestore undefined değeri kabul etmez — queueJobId opsiyonel, filtrele
  const { queueJobId, ...rest } = entry
  const doc: Record<string, unknown> = { ...rest, editedAt: now, editor: NAHABER_AUTHOR_ID }
  if (queueJobId !== undefined) doc.queueJobId = queueJobId
  await db.collection(Collections.NEWS).doc(newsId).collection('editHistory').add(doc)
}

export async function processNewsroomArticle(
  db: Firestore,
  input: NewsroomArticleInput,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const fingerprint =
    input.rssFingerprint ?? `${input.editorId}:${input.sourceUrl}`.slice(0, 128)

  if (options.changeType !== 'updated') {
    const existing = await findExistingByFingerprint(db, fingerprint)
    if (existing?.collection === 'news' && !options.existingNewsId) {
      return { outcome: 'skipped' }
    }
    if (
      existing?.collection === 'newsDrafts' &&
      existing.id !== options.reprocessDraftId
    ) {
      return { outcome: 'skipped' }
    }
  }

  // ── PROMOTIONAL CONTENT GATE ───────────────────────────────────────────────
  // Sosyal medya tanıtım içerikleri (WhatsApp/Bluesky/Telegram kanalı paylaşımı)
  // yayına alınmadan önce atlanır.
  if (isPromotionalContent(input.originalTitle, input.originalContent ?? '', input.originalSummary)) {
    console.log(`[newsroom/pipeline] promo content filtered: ${input.sourceUrl?.slice(0, 80)}`)
    return { outcome: 'skipped' }
  }

  // ── LIVE BROADCAST GATE ────────────────────────────────────────────────────
  // Canlı yayın / basın toplantısı linkleri — haber değil yönlendirme.
  // Başlıkta #Canlı veya canlı yayın desenleri varsa pipeline'a alınmaz.
  if (isLiveBroadcastContent(input.originalTitle, input.originalContent, input.originalSummary)) {
    console.log(`[newsroom/pipeline] live broadcast filtered: ${input.originalTitle?.slice(0, 80)}`)
    return { outcome: 'skipped' }
  }

  try {
    // ── EXTRACTION STAGE ────────────────────────────────────────────────────
    // Triggers when RSS content is thin (<500 chars) OR truncated mid-sentence.
    // Truncation check catches RSS feeds that clip at character limits without
    // a sentence boundary — e.g. "Aziz Yıldırım ve yönetim k".
    let workingInput = { ...input }

    const totalRaw = (workingInput.originalContent + ' ' + workingInput.originalSummary).trim()
    const contentTruncated = isTruncated(workingInput.originalContent?.trimEnd() ?? '')
    const needsExtraction =
      !workingInput.skipAiRewrite &&
      (totalRaw.length < QUALITY_MIN_CHARS || contentTruncated)

    if (contentTruncated) {
      console.log(`[newsroom/pipeline] truncated RSS content detected, fetching full article: ${workingInput.sourceUrl}`)
    }

    if (needsExtraction && workingInput.sourceUrl) {
      try {
        const extracted = await fetchArticleEnrichment(
          workingInput.sourceUrl,
          12_000,
          { title: workingInput.originalTitle }
        )
        if (extracted) {
          // Only replace content if extracted text is substantially longer/cleaner
          if (extracted.bodyText && extracted.bodyText.length > (workingInput.originalContent?.length ?? 0)) {
            workingInput = { ...workingInput, originalContent: extracted.bodyText }
          }
          if (extracted.htmlBody && !workingInput.htmlContent) {
            workingInput = { ...workingInput, htmlContent: extracted.htmlBody }
          }
          if (extracted.imageUrl && !workingInput.imageUrl) {
            workingInput = { ...workingInput, imageUrl: extracted.imageUrl }
          }
          if (extracted.readingTimeMinutes && !workingInput.readingTimeMinutes) {
            workingInput = { ...workingInput, readingTimeMinutes: extracted.readingTimeMinutes }
          }
          if (extracted.author && !workingInput.extractedAuthor) {
            workingInput = { ...workingInput, extractedAuthor: extracted.author }
          }
        }
      } catch {
        // non-blocking — proceed with GPT fallback below
      }
    }

    // ── QUALITY GATE ────────────────────────────────────────────────────────
    // After extraction, skip if content is still too thin or truncated.
    // We do NOT generate articles from headlines — that produces hallucinated news.
    const totalAfterExtract = (workingInput.originalContent + ' ' + workingInput.originalSummary).trim()
    const stillTruncated = isTruncated(workingInput.originalContent?.trimEnd() ?? '')

    if (!workingInput.skipAiRewrite) {
      if (totalAfterExtract.length < QUALITY_MIN_CHARS) {
        console.warn(`[newsroom/pipeline] quality gate: içerik çok kısa (${totalAfterExtract.length} kar), atlandı: ${workingInput.sourceUrl}`)
        return { outcome: 'skipped' }
      }
      if (stillTruncated) {
        console.warn(`[newsroom/pipeline] quality gate: içerik hâlâ kesilmiş, atlandı: ${workingInput.sourceUrl}`)
        return { outcome: 'skipped' }
      }
    }

    // ── LIVE BROADCAST GATE (POST-EXTRACTION) ────────────────────────────────
    // Bazı RSS beslemeleri canlı yayın işaretlerini sadece tam içerikte gösterir;
    // truncated feed'lerde başlık temiz görünür ama body "#canlıyayın" / youtube
    // linki / basın toplantısı ifadesi içerir. Full fetch sonrası tekrar kontrol.
    if (isLiveBroadcastContent(workingInput.originalTitle, workingInput.originalContent, workingInput.originalSummary)) {
      console.log(`[newsroom/pipeline] live broadcast filtered (post-extraction): ${workingInput.originalTitle?.slice(0, 80)}`)
      return { outcome: 'skipped' }
    }

    // ── TRANSLATION STAGE ────────────────────────────────────────────────────
    // Detect non-Turkish content and translate before AI rewrite.
    //
    // TWO cases:
    //   1. skipAiRewrite=true (trend, influencer): translate directly — no AI rewrite will run.
    //   2. skipAiRewrite=false (RSS workers): clear htmlContent so the AI-rewritten Turkish
    //      text is displayed instead of the raw English HTML from extraction.
    const langSample = [workingInput.originalTitle, workingInput.originalSummary, workingInput.originalContent]
      .filter(Boolean).join(' ').slice(0, 300)
    const isNonTurkish = !looksLikeTurkish(langSample)

    if (isNonTurkish) {
      if (workingInput.skipAiRewrite) {
        // No AI rewrite coming — must translate explicitly
        const translated = await translateToTurkish({
          originalTitle: workingInput.originalTitle,
          originalSummary: workingInput.originalSummary,
          originalContent: workingInput.originalContent,
        })
        if (translated) {
          workingInput = { ...workingInput, ...translated }
        } else {
          // No AI key AND no translation → skip non-Turkish content
          console.warn(`[newsroom/pipeline] İngilizce içerik, çeviri yapılamadı → atlandı: ${workingInput.sourceUrl}`)
          return { outcome: 'skipped' }
        }
      } else {
        // AI rewrite will translate — but drop English htmlContent so Turkish text shows
        if (workingInput.htmlContent) {
          workingInput = { ...workingInput, htmlContent: undefined }
          console.log(`[newsroom/pipeline] cleared English htmlContent — AI rewrite will produce Turkish: ${workingInput.sourceUrl}`)
        }
        // If no AI configured, skip English content — don't publish untranslated
        const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim()
        const geminiKey = process.env.GEMINI_API_KEY?.trim()
        if (!deepseekKey && !geminiKey) {
          console.warn(`[newsroom/pipeline] İngilizce içerik, AI key yok → atlandı: ${workingInput.sourceUrl}`)
          return { outcome: 'skipped' }
        }
      }
    }

    // ── AI REWRITE STAGE ──────────────────────────────────────────────────────
    // skipAiRewrite=true → trend/influencer editörler kendi içeriğini üretir, yeniden yazma yok
    // skipAiRewrite=false → 4 aşamalı AI editör zinciri (+ V2 persona context)
    const routedEditor = workingInput.skipAiRewrite
      ? null
      : await routeAiEditor({
          categoryId: workingInput.forcedCategoryId,
          isBreaking: workingInput.isBreaking,
          preferredAiEditorId: workingInput.preferredAiEditorId,
          articleFormat: workingInput.articleFormat ?? 'standard',
          text: [workingInput.originalTitle, workingInput.originalSummary, workingInput.originalContent]
            .filter(Boolean)
            .join('\n')
            .slice(0, 4000),
          citySlug: workingInput.forcedCitySlug ?? null,
        }).catch(() => null)

    let personaSystem: string | undefined
    let personaUser: string | undefined
    let writerModel: string | undefined
    let promptVersions: Record<string, number> | undefined

    if (routedEditor && !workingInput.skipAiRewrite) {
      try {
        const built = await buildEditorPrompt({
          editor: routedEditor,
          task: workingInput.articleFormat === 'column' ? 'column' : 'news',
          sourceTitle: workingInput.originalTitle,
          sourceBody: workingInput.originalContent || workingInput.originalSummary,
          sourceUrl: workingInput.sourceUrl,
          categoryId: workingInput.forcedCategoryId,
          province: workingInput.forcedCity,
          district: workingInput.forcedDistrict,
        })
        personaSystem = built.system
        personaUser = built.user
        promptVersions = built.promptVersions as Record<string, number>
        const resolved = resolveModelForEditor(
          routedEditor,
          workingInput.articleFormat === 'column' ? 'column' : 'news'
        )
        writerModel = resolved.model
      } catch (err) {
        console.warn(
          '[pipeline] persona prompt build failed:',
          err instanceof Error ? err.message : err
        )
      }
    }

    const stageInputBase = {
      sourceLabel: workingInput.sourceLabel,
      originalTitle: workingInput.originalTitle,
      originalSummary: workingInput.originalSummary,
      originalContent: workingInput.originalContent,
      sourceUrl: workingInput.sourceUrl,
      forcedCategoryId: workingInput.forcedCategoryId,
      systemPromptOverride: personaSystem,
      userPromptOverride: personaUser,
      writerModel,
      aiEditorId: routedEditor?.id,
    }

    let rewrittenRaw: MultiStageResult | (AiRewriteResult & {
      gateDecision: 'publish' | 'draft' | 'skip'
      gateReasons: string[]
      publishScore: number
    }) = workingInput.skipAiRewrite
      ? {
          title: workingInput.originalTitle,
          spot: workingInput.originalSummary ?? '',
          summary: workingInput.originalSummary,
          description: workingInput.originalContent,
          seoTitle: workingInput.originalTitle,
          seoDescription: workingInput.originalSummary?.slice(0, 160) ?? '',
          categoryId: workingInput.forcedCategoryId ?? 'gundem',
          categoryConfidence: 80,
          isBreaking: workingInput.isBreaking ?? false,
          city: null,
          district: null,
          country: 'Türkiye',
          tags: workingInput.extraTags ?? [],
          gateDecision: 'publish' as const,
          gateReasons: [] as string[],
          publishScore: 80,
        }
      : await runMultiStageEditor(stageInputBase)

    let rewriteAttempt = 0

    const articleIncomplete = (r: {
      title?: string
      spot?: string
      summary?: string
      description?: string
    }) =>
      titleLooksIncomplete(r.title || '') ||
      contentHasIncompleteSegments(r.spot || '') ||
      contentHasIncompleteSegments(r.summary || '') ||
      contentHasIncompleteSegments(r.description || '') ||
      isNewsBodyTooShort(r.description || '')

    // Düşük gate / kısa / yarım gövde → yeniden yazım (onay kuyruğuna yarım haber basmamak için)
    if (
      !workingInput.skipAiRewrite &&
      NEWSROOM_REWRITE_MAX_RETRIES > 0 &&
      rewrittenRaw.gateDecision !== 'skip'
    ) {
      let attempt = 0
      while (
        attempt < NEWSROOM_REWRITE_MAX_RETRIES &&
        (rewrittenRaw.gateDecision === 'draft' ||
          (rewrittenRaw.publishScore ?? 0) < 60 ||
          rewrittenRaw.categoryConfidence === 0 ||
          articleIncomplete(rewrittenRaw))
      ) {
        attempt += 1
        const hints = [
          ...(rewrittenRaw.gateReasons ?? []),
          isNewsBodyTooShort(rewrittenRaw.description || '')
            ? `Gövde çok kısa (<${MIN_NEWS_BODY_WORDS} kelime) — olgu ve bağlam ekle`
            : '',
          rewrittenRaw.categoryConfidence === 0
            ? 'Önceki çıktı AI fallback — kaynak metinden profesyonel haber yaz'
            : '',
          articleIncomplete(rewrittenRaw)
            ? 'Önceki metin YARIM KESİLMİŞ (spot/summary/content). Tüm alanları noktalı, eksiksiz cümlelerle yeniden yaz.'
            : '',
        ].filter(Boolean)

        console.warn(
          `[pipeline] rewrite retry #${attempt} (${hints.slice(0, 3).join('; ')}): ${workingInput.sourceUrl?.slice(0, 80)}`
        )

        const retryRaw = await runMultiStageEditor({
          ...stageInputBase,
          revisionHints: hints,
          previousDraft: {
            title: rewrittenRaw.title,
            spot: rewrittenRaw.spot || rewrittenRaw.summary || '',
            content: rewrittenRaw.description || '',
          },
        })
        rewriteAttempt = attempt

        const prevIncomplete = articleIncomplete(rewrittenRaw)
        const nextIncomplete = articleIncomplete(retryRaw)
        const better =
          (!nextIncomplete && prevIncomplete) ||
          retryRaw.gateDecision === 'publish' ||
          (retryRaw.publishScore ?? 0) > (rewrittenRaw.publishScore ?? 0) ||
          (countPlainWords(retryRaw.description) > countPlainWords(rewrittenRaw.description) &&
            retryRaw.categoryConfidence > 0) ||
          (retryRaw.categoryConfidence > 0 && rewrittenRaw.categoryConfidence === 0)

        if (better) rewrittenRaw = retryRaw
        else if (!nextIncomplete && retryRaw.categoryConfidence > 0) rewrittenRaw = retryRaw

        if (!articleIncomplete(rewrittenRaw) && rewrittenRaw.gateDecision === 'publish') break
      }
    }

    if (routedEditor && !workingInput.skipAiRewrite) {
      void recordAiUsage({
        editorId: routedEditor.id,
        task: workingInput.articleFormat === 'column' ? 'column' : 'news',
        provider: 'deepseek',
        model: writerModel || process.env.DEEPSEEK_NEWS_MODEL || 'deepseek',
        published: false,
      })
    }

    // Gate keeper skip kararı → haber atlanır
    if (!workingInput.skipAiRewrite && rewrittenRaw.gateDecision === 'skip') {
      console.warn(`[pipeline] gate keeper skip: ${workingInput.sourceUrl?.slice(0, 80)}`)
      return { outcome: 'skipped' }
    }

    // AiRewriteResult uyumluluğu için tip cast
    const rewritten: AiRewriteResult & { gateDecision?: string; gateReasons?: string[]; publishScore?: number } = rewrittenRaw

    const outputChars = (rewritten.description || '').trim().length
    if (!workingInput.skipAiRewrite && outputChars < QUALITY_MIN_CHARS) {
      console.warn(
        `[newsroom/pipeline] AI çıktısı çok kısa (${outputChars} kar), atlandı: ${workingInput.sourceUrl?.slice(0, 80)}`
      )
      return { outcome: 'skipped' }
    }

    const factCheck = await factChecker.check({
      sourceLabel: workingInput.sourceLabel,
      sourceUrl: workingInput.sourceUrl,
      originalTitle: workingInput.originalTitle,
      originalSummary: workingInput.originalSummary,
      originalContent: workingInput.originalContent,
      rewritten,
    })

    const resolvedCategoryRaw = categoryEngine.resolve(
      rewritten.categoryId,
      workingInput.editorType,
      workingInput.forcedCategoryId
    )

    const classification = categoryEngine.validate({
      aiCategoryId: resolvedCategoryRaw,
      categoryConfidence: rewritten.categoryConfidence,
      aiIsBreaking: rewritten.isBreaking ?? workingInput.isBreaking,
      title: rewritten.title,
      body: rewritten.description,
      editorType: workingInput.editorType,
    })

    if (classification.overrides.length > 0) {
      console.log(
        `[newsroom/category] ${workingInput.sourceUrl}: ${classification.overrides.join('; ')}`
      )
    }

    // ── AI Final Editor: category sanity check ──────────────────────────────
    // Worker forcedCategoryId is a prior/hint, not a hard lock (except trend/influencer).
    // Local feeds also go through AI so foreign/national stories aren't stuck as yerel-haber.
    const skipAiCategoryCheck =
      workingInput.editorType === 'trend' ||
      workingInput.editorType === 'influencer'

    if (!skipAiCategoryCheck) {
      try {
        const aiCheck = await classifyArticleCategory(
          rewritten.title,
          rewritten.description ?? rewritten.summary ?? '',
          classification.categoryId,
        )
        if (aiCheck && aiCheck.categoryId !== classification.categoryId) {
          console.log(
            `[newsroom/ai-editor] Kategori düzeltildi: ${classification.categoryId} → ${aiCheck.categoryId} ` +
            `(güven: ${aiCheck.confidence}) — ${aiCheck.reason}`
          )
          classification.categoryId = aiCheck.categoryId
          classification.categoryConfidence = aiCheck.confidence
          // Re-run heuristic validation so AI cannot undo sport/local/breaking guards
          const revalidated = categoryEngine.validate({
            aiCategoryId: classification.categoryId,
            categoryConfidence: classification.categoryConfidence,
            aiIsBreaking: classification.isBreaking,
            title: rewritten.title,
            body: rewritten.description,
            editorType: workingInput.editorType,
          })
          classification.categoryId = revalidated.categoryId
          classification.categoryConfidence = revalidated.categoryConfidence
          classification.isBreaking = revalidated.isBreaking
          if (revalidated.overrides.length > 0) {
            classification.overrides.push(...revalidated.overrides)
            console.log(
              `[newsroom/category] post-AI revalidate: ${revalidated.overrides.join('; ')}`
            )
          }
        }
      } catch {
        // Non-blocking — if AI check fails, keep the rule-based category
      }
    }

    const astrologyFixed = applyAstrologyCategoryOverride(
      classification.categoryId,
      rewritten.title,
      rewritten.description ?? rewritten.summary ?? '',
      (rewritten as AiRewriteResult).tags ?? []
    )
    if (astrologyFixed !== classification.categoryId) {
      console.log(
        `[newsroom/category] burç override: ${classification.categoryId} → ${astrologyFixed}`
      )
      classification.categoryId = astrologyFixed
      classification.overrides.push('burç/astroloji → astroloji')
    }

    // Geo: final kategori bilindikten sonra (dunya → ülke, yerel → ilçe)
    const geo = geoEngine.enrich(rewritten, workingInput.extraTags ?? [], {
      categoryId: classification.categoryId,
    })

    let city = geo.city
    let district = geo.district
    let citySlug = geo.citySlug
    let districtSlug = geo.districtSlug
    let country = geo.country
    let countrySlug = geo.countrySlug

    // forcedDistrict uygula (her zaman)
    if (workingInput.forcedDistrict?.trim()) {
      district = workingInput.forcedDistrict.trim()
    }

    // ── forcedCitySlug override — SADECE yerel-haber + içerikten şehir bulunamadıysa ──
    // Kural: geo engine haber metninden bir şehir çıkardıysa (geo.city) → onu koru.
    // forcedCitySlug (kaynak gazetenin şehri) yalnızca FALLBACK olarak devreye girer:
    //   - Haber yerel-haber kategorisindeyse
    //   - Yurt dışı haber değilse
    //   - VE içerikten şehir bulunamadıysa
    // Örnek sorun (önceki davranış): Muğla gazetesinden alınan Hakkari haberi → geo.city = "Hakkari"
    // ama forcedCitySlug = "mugla" eziyordu. Artık içerik şehri korunur.
    const finalCategoryIsLocal = classification.categoryId === 'yerel-haber'
    const articleIsAbroad =
      classification.categoryId === 'dunya' ||
      Boolean(country && country !== 'Türkiye') ||
      Boolean(countrySlug)

    if (articleIsAbroad) {
      // Yurt dışı haber — kaynak şehri ne olursa olsun city sıfırla
      city = null
      citySlug = ''
      district = null
      districtSlug = ''
      if (!country || country === 'Türkiye') {
        const retry = resolveCountryFromText(
          `${rewritten.title} ${rewritten.description} ${(rewritten.tags || []).join(' ')}`
        )
        if (retry) {
          country = retry.name
          countrySlug = retry.slug
        }
      }
    } else if (workingInput.forcedCitySlug?.trim() && finalCategoryIsLocal && !geo.city) {
      // Geo engine içerikten şehir bulamadı → kaynak şehrini fallback olarak kullan
      citySlug = normalizeCitySlug(workingInput.forcedCitySlug)
      city = workingInput.forcedCity?.trim() || getCityCategoryName(citySlug)
    }
    // else: geo engine'in içerikten bulduğu şehri koru (geo.city)

    const moderationRaw = await moderateContent({
      text: `${rewritten.title}\n\n${rewritten.description}`,
      mediaUrls: workingInput.imageUrl ? [{ url: workingInput.imageUrl, type: 'image' }] : [],
    })
    // Fail-closed: moderation API errors stay as review → draft (never auto-approve)
    const moderationFailClosed =
      process.env.NEWSROOM_MODERATION_FAIL_CLOSED !== '0'
    const moderation =
      moderationFailClosed
        ? moderationRaw
        : moderationRaw.reasons.some((r) => r.startsWith('error:'))
          ? { ...moderationRaw, decision: 'approve' as const }
          : moderationRaw

    const now = Date.now()
    // Yurt dışı: şehir olmasa da ülke korunur (location null → country Türkiye fallback YASAK)
    const locationRaw = articleIsAbroad
      ? {
          city: '',
          country: country.trim() || 'Türkiye',
          lat: 0,
          lng: 0,
          ...(district?.trim() ? { district: district.trim() } : {}),
        }
      : toLocation(city, district, country)
    const location = locationRaw
      ? {
          ...locationRaw,
          country: articleIsAbroad
            ? country.trim() || locationRaw.country || 'Türkiye'
            : locationRaw.country ?? 'Türkiye',
        }
      : null
    if (location && citySlug && !articleIsAbroad) {
      location.city = city ?? location.city
      if (district) location.district = district
    }
    const resolvedCitySlug = articleIsAbroad
      ? ''
      : normalizeCitySlug(location?.city ? slugifyCity(location.city) : citySlug)
    const cityCategory = resolvedCitySlug ? cityCategoryId(resolvedCitySlug) : ''
    const resolvedCategory = classification.categoryId || cityCategory

    const isBreaking = classification.isBreaking
    const breakingScore = computeBreakingScore(
      workingInput,
      rewritten.title,
      rewritten.description,
      isBreaking,
      workingInput.priorityScore
    )
    const breakingFlags = resolveBreakingFlags(breakingScore)
    const priorityScore = breakingScore

    const lowConfidence = factCheck.confidenceScore < NEWSROOM_LOW_CONFIDENCE_THRESHOLD
    const factCheckFailedBadly =
      factCheck.confidenceScore < 35 ||
      factCheck.flags.includes('speculation') ||
      factCheck.flags.includes('title_mismatch') ||
      factCheck.flags.includes('unsupported_claims')

    // ── YAYINLAMA KARARI ─────────────────────────────────────────────────────────
    // Gate keeper 'draft' kararı → ham içerik / kalite sorunu → taslağa al
    // Gate keeper 'publish' kararı → AI yazdı, kalite geçti → eski fact-check koşulları geçerlir
    const gateDraft = !workingInput.skipAiRewrite && rewrittenRaw.gateDecision === 'draft'
    const isFallbackContent = !workingInput.skipAiRewrite && rewritten.categoryConfidence === 0
    // Heuristik fact-check tek başına taslak zorlamaz — skor eşiği yeter.
    // (Eski: factcheck_heuristic → her zaman draft → otomatik yayın fiilen kapalıydı.)

    if (gateDraft) {
      console.warn(
        `[pipeline] gate keeper taslağa aldı (${rewrittenRaw.gateReasons?.join(', ')}): ${workingInput.sourceUrl?.slice(0, 80)}`
      )
    } else if (isFallbackContent) {
      console.warn(
        `[pipeline] fallback içerik (AI başarısız) — taslağa alınıyor: ${workingInput.sourceUrl?.slice(0, 80)}`
      )
    }

    const incompleteText =
      titleLooksIncomplete(rewritten.title || '') ||
      contentHasIncompleteSegments(rewritten.description || '') ||
      contentHasIncompleteSegments((rewritten as AiRewriteResult).spot || '') ||
      contentHasIncompleteSegments(rewritten.summary || '')

    const bodyTooShort = isNewsBodyTooShort(rewritten.description || '')
    if (bodyTooShort) {
      console.warn(
        `[pipeline] short body (${countPlainWords(rewritten.description)} < ${MIN_NEWS_BODY_WORDS}) — forcing draft: ${workingInput.sourceUrl?.slice(0, 80)}`
      )
    }

    // Final kategoriye göre byline personasını seç (yazım worker hint'i ile yapılmış olabilir)
    let publishEditor = routedEditor
    if (
      !workingInput.skipAiRewrite &&
      !workingInput.preferredAiEditorId &&
      resolvedCategory
    ) {
      const byCategory = await routeAiEditor({
        categoryId: resolvedCategory,
        isBreaking,
        articleFormat: workingInput.articleFormat ?? 'standard',
        text: [workingInput.originalTitle, workingInput.originalSummary]
          .filter(Boolean)
          .join('\n')
          .slice(0, 2000),
        citySlug: workingInput.forcedCitySlug ?? null,
      }).catch(() => null)
      if (byCategory) publishEditor = byCategory
    }

    const personaRequiresApproval = aiEditorForcesDraft(publishEditor?.publishPolicy)

    const confidenceThreshold =
      rewriteAttempt > 0
        ? Math.max(40, NEWSROOM_AUTO_PUBLISH_THRESHOLD - NEWSROOM_RETRY_CONFIDENCE_RELAX)
        : NEWSROOM_AUTO_PUBLISH_THRESHOLD

    // AUTO_PUBLISH / REQUIRES_APPROVAL: kalite kapısını geçerse yayın.
    // Yalnızca DRAFT_ONLY persona veya düşük güven / gate / moderasyon → taslak.
    const needsDraft =
      gateDraft ||
      isFallbackContent ||
      factCheck.confidenceScore < confidenceThreshold ||
      factCheckFailedBadly ||
      moderation.decision === 'review' ||
      moderation.decision !== 'approve' ||
      incompleteText ||
      bodyTooShort ||
      personaRequiresApproval

    if (incompleteText) {
      console.warn(
        `[pipeline] incomplete text detected — forcing draft: ${workingInput.sourceUrl?.slice(0, 80)}`
      )
    }

    // Estimate reading time from AI-written content
    const readingWords = (rewritten.description || '').trim().split(/\s+/).filter(Boolean).length
    const readingTimeMinutes = workingInput.readingTimeMinutes ?? Math.max(1, Math.ceil(readingWords / 200))

    const bodyBlocks = buildBodyBlocksFromAi({
      title: rewritten.title,
      spot: (rewritten as AiRewriteResult).spot ?? rewritten.summary,
      summary: rewritten.summary,
      content: rewritten.description,
      imageUrl: workingInput.imageUrl,
      imageCaption: rewritten.title,
    })
    const plainFromBlocks = articleBlocksToPlainText(bodyBlocks)
    const contentBody = plainFromBlocks || rewritten.description

    const personaAuthors = publishEditor ? authorFieldsFromEditor(publishEditor) : null

    const doc = {
      title: rewritten.title,
      // Journalistic lead paragraph (2-4 sentences, answers 5W+H)
      spot: (rewritten as AiRewriteResult).spot ?? rewritten.summary ?? '',
      summary: rewritten.summary,
      description: contentBody,
      // Full AI-written article body (plain fallback)
      content: contentBody,
      bodyBlocks,
      // Extracted HTML from source page (for rich rendering) — clear when bodyBlocks present
      htmlContent: bodyBlocks.length > 0 ? '' : (workingInput.htmlContent ?? ''),
      // SEO fields — generated by AI, optimized for search
      seoTitle: (rewritten as AiRewriteResult).seoTitle ?? rewritten.title,
      seoDescription: (rewritten as AiRewriteResult).seoDescription ?? rewritten.summary,
      author: personaAuthors?.author || workingInput.extractedAuthor || NAHABER_AUTHOR,
      authorId: personaAuthors?.authorId || NAHABER_AUTHOR_ID,
      // Persona alanları: undefined değil, ya değer var ya da hiç dahil edilmez
      ...(personaAuthors?.authorUsername?.trim()
        ? { authorUsername: personaAuthors.authorUsername }
        : {}),
      ...(personaAuthors?.authorDisplayName?.trim()
        ? { authorDisplayName: personaAuthors.authorDisplayName }
        : {}),
      ...(personaAuthors?.authorPhotoURL
        ? { authorPhotoURL: personaAuthors.authorPhotoURL }
        : {}),
      ...(personaAuthors?.aiEditorId?.trim()
        ? { aiEditorId: personaAuthors.aiEditorId }
        : {}),
      articleFormat: workingInput.articleFormat ?? 'standard',
      ...(promptVersions ? { aiPromptVersions: promptVersions } : {}),
      thumbnail: workingInput.imageUrl ?? '',
      coverImageUrl: workingInput.imageUrl ?? '',
      videoUrl: '',
      category: resolvedCategory,
      categoryId: resolvedCategory,
      // Structured AI body (H2/H3 + captions) uses longform rhythm for every
      // category / subcategory — not only gezi.
      articleLayout: (bodyBlocks.some((b) => b.type === 'heading')
        ? 'longform'
        : 'standard') as 'standard' | 'longform',
      city: articleIsAbroad ? '' : location?.city ?? city ?? '',
      district: articleIsAbroad ? '' : location?.district ?? district ?? '',
      districtSlug: articleIsAbroad ? '' : districtSlug || '',
      citySlug: resolvedCitySlug,
      country: articleIsAbroad
        ? country || location?.country || 'Türkiye'
        : location?.country ?? country ?? 'Türkiye',
      countrySlug: articleIsAbroad ? countrySlug || '' : '',
      location: location ?? null,
      tags: geo.tags,
      type: 'news' as const,
      source: workingInput.sourceLabel ?? null,
      sourceUrl: workingInput.sourceUrl ?? '',
      researchSources: workingInput.researchSources ?? [],
      readingTimeMinutes,
      draftStatus: 'pending_review' as const,
      moderationReasons: [
        ...(moderation.decision === 'review' ? moderation.reasons : []),
        ...(incompleteText ? ['incomplete_text'] : []),
        ...(personaRequiresApproval ? ['ai_editor_requires_approval'] : []),
      ],
      aiGenerated: true,
      rssFingerprint: fingerprint,
      rssGuid: workingInput.rssGuid ?? workingInput.sourceUrl ?? '',
      ingestionSourceId: workingInput.ingestionSourceId ?? workingInput.editorId ?? '',
      sourceLabel: workingInput.sourceLabel ?? null,
      originalTitle: workingInput.originalTitle ?? null,
      ingestedAt: now,
      sourcePublishedAt: workingInput.sourcePublishedAt ?? null,
      createdAt: now,
      updatedAt: now,
      editorId: workingInput.editorId,
      editorType: workingInput.editorType,
      confidenceScore: factCheck.confidenceScore,
      factCheckFlags: factCheck.flags,
      isBreaking,
      priorityScore,
      breakingScore,
      isPinned: breakingFlags.isPinned,
      isTrending: breakingFlags.isTrending,
      needsAdminReview: needsDraft,
    }

    let targetNewsId = options.existingNewsId

    if (!targetNewsId && options.changeType !== 'updated') {
      const similar = await findSimilarPublishedArticle(
        db,
        rewritten.title,
        rewritten.description
      )
      if (similar) {
        targetNewsId = similar.newsId
        console.log(
          `[newsroom/dedupe] ${similar.similarity.toFixed(2)} similar → update ${similar.newsId}`
        )
      }
    }

    if (targetNewsId) {
      if (needsDraft) {
        // Mevcut canlı haberi ince bırakma — gövdeyi güncelleyip taslağa al (AdSense / kalite)
        const { createdAt: existingCreatedAt, ingestedAt: _ingestedAt, ...draftFields } = doc
        await db.collection(Collections.NEWS).doc(targetNewsId).set(
          {
            ...draftFields,
            // Keep/seed createdAt — admin list orderBy excludes docs missing this field
            createdAt: existingCreatedAt ?? now,
            status: 'draft',
            featured: false,
            isEditorPick: false,
            featuredAt: null,
            needsAdminReview: true,
            moderationNote: bodyTooShort
              ? `İnce içerik (${countPlainWords(rewritten.description)} kelime) — pipeline taslak`
              : 'Kalite kapısı — pipeline taslak',
            contentBackfillStatus: 'drafted_by_pipeline',
            updatedAt: now,
          },
          { merge: true }
        )
        console.log(
          `[newsroom] demoted thin/live ${targetNewsId} → draft (confidence=${factCheck.confidenceScore})`
        )
        return { outcome: 'updated', lowConfidence: true, newsId: targetNewsId }
      }

      await newsDraftService.updatePublishedNews(db, targetNewsId, doc, {
        duplicateOf: targetNewsId,
        canonicalId: targetNewsId,
      })

      await appendEditHistory(db, targetNewsId, {
        changeType: options.changeType ?? 'similarity_merge',
        title: rewritten.title,
        summary: rewritten.summary,
        confidenceScore: factCheck.confidenceScore,
        queueJobId: options.queueJobId,
      })

      if (breakingFlags.shouldPushNotify) {
        await queueBreakingPushNotification(targetNewsId, rewritten.title, breakingScore)
      }

      console.log(`[newsroom] updated ${targetNewsId} (confidence=${factCheck.confidenceScore})`)
      return { outcome: 'updated', lowConfidence, newsId: targetNewsId }
    }

    const canAutoPublish = !needsDraft && moderation.decision === 'approve'

    if (canAutoPublish) {
      const publishOpts = options.targetNewsId
        ? {
            newsId: options.targetNewsId,
            publishedAt: options.publishedAt,
            preferredSlug: options.preferredSlug,
          }
        : undefined
      const { newsId, slug } = await newsDraftService.publishFromPipeline(db, doc, publishOpts)
      if (options.reprocessDraftId) {
        await db.collection(Collections.NEWS_DRAFTS).doc(options.reprocessDraftId).delete().catch(() => {})
      }
      if (breakingFlags.shouldPushNotify) {
        await queueBreakingPushNotification(newsId, rewritten.title, breakingScore)
      }
      try {
        const { revalidatePath } = await import('next/cache')
        const { revalidateHomeFeedCaches } = await import('@/lib/revalidateHome')
        revalidateHomeFeedCaches()
        if (resolvedCategory) revalidatePath(`/kategori/${resolvedCategory}`)
        if (resolvedCategory === 'yerel-haber') revalidatePath('/yerel')
        if (slug) revalidatePath(`/haber/${slug}`)
        if (personaAuthors?.authorUsername) {
          revalidatePath(`/yazar/${personaAuthors.authorUsername}`)
        }
      } catch {
        /* cron / non-Next contexts */
      }
      console.log(
        `[newsroom] auto-published ${newsId} (confidence=${factCheck.confidenceScore}, retry=${rewriteAttempt})`
      )
      return { outcome: 'published', lowConfidence, newsId }
    }

    const draftPayload = {
      ...doc,
      rewriteAttempt,
      autoReprocessAt: Date.now(),
      ...(options.reprocessDraftId
        ? {}
        : { autoReprocessCount: 0 }),
    }

    if (options.reprocessDraftId) {
      const draftRef = db.collection(Collections.NEWS_DRAFTS).doc(options.reprocessDraftId)
      const prev = await draftRef.get()
      const prevCount = Number(prev.data()?.autoReprocessCount ?? 0)
      await draftRef.set(
        {
          ...draftPayload,
          createdAt: prev.data()?.createdAt ?? now,
          autoReprocessCount: prevCount + 1,
          updatedAt: now,
          needsAdminReview: true,
        },
        { merge: true }
      )
      return { outcome: 'created', lowConfidence, newsId: options.reprocessDraftId }
    }

    await db.collection(Collections.NEWS_DRAFTS).add(draftPayload)
    return { outcome: 'created', lowConfidence }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    // Duplikat veya İngilizce içerik skip → sessizce atla, hata değil
    if (msg.includes('AI duplikat tespit etti') || msg.includes('yayın atlandı')) {
      console.log(`[newsroom/pipeline] skipped: ${msg}`)
      return { outcome: 'skipped' }
    }
    console.error('[newsroom/pipeline] failed:', input.sourceUrl, error)
    return { outcome: 'failed' }
  }
}
