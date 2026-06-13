/**
 * Gemini 2.5 Flash — Chief News Editor
 *
 * Görevleri: haber yazma, SEO, kategori, kalite puanlama,
 * sosyal medya metinleri, push bildirim, schema.org alanları
 *
 * API: https://generativelanguage.googleapis.com (REST, no SDK required)
 * Env: GEMINI_API_KEY
 */

import type { GeminiEditResult } from './types'

const GEMINI_MODEL = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

// ── Config ────────────────────────────────────────────────────────────────────
function getConfig(): { apiKey: string } | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return null
  return { apiKey }
}

export function isGeminiConfigured(): boolean {
  return Boolean(getConfig())
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen NaHaber'in Yapay Zeka Genel Yayın Yönetmeni'sin. Türkiye'nin en büyük dijital haber platformu için profesyonel, SEO uyumlu, Google Discover optimizasyonlu Türkçe haberler üretiyorsun.

GÖREVLER:
1. Ham haberi profesyonel Türkçe gazete diline çevir
2. Tüm SEO alanlarını doldur
3. Sosyal medya metinlerini oluştur
4. Kategori ve etiketleri belirle
5. Kalite ve güven puanları ver

KURALLARI:
- ÇIKTI DİLİ: Her zaman TÜRKÇE
- Clickbait, yanlış bilgi, kaynak göstermeyen haber YASAK
- Profesyonel gazete dili: tarafsız, akıcı, doğal Türkçe
- Başlıkta BÜYÜK HARF spam, "FLAŞ", "SON DAKİKA" ifadeleri YASAK
- title, summary, content birbirinden FARKLI olmalı
- Paragraflar arasında \\n\\n kullan
- Google News ve Google Discover uyumlu yaz

KATEGORİ KURALLARI:
- son-dakika: YALNIZCA deprem, büyük afet, darbe girişimi, suikast
- teknoloji: Apple, iOS, Android, yapay zeka, yazılım, donanım
- siyaset: seçim, meclis, parti, cumhurbaşkanı, bakan
- ekonomi: borsa, döviz, faiz, enflasyon, şirket
- spor: maç, lig, transfer, sporcu — isBreaking=false
- saglik: hastalık, ilaç, aşı, hastane
- dunya: yurt dışı olaylar, uluslararası haberler
- kultur: sinema, tiyatro, müzik, sanat
- magazin: ünlüler, dedikodu — isBreaking=false
- gundem: diğer Türkiye haberleri
- yerel-haber: tek bir il/ilçe haberi

ÇIKTI: Yalnızca geçerli JSON döndür, başka hiçbir şey ekleme.`

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildPrompt(params: {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  enrichedContent?: string
  forcedCategoryId?: string
}): string {
  const content = params.enrichedContent || params.originalContent || params.originalSummary
  return `Aşağıdaki ham haberi düzenle ve JSON formatında döndür.

KAYNAK: ${params.sourceLabel}
KAYNAK URL: ${params.sourceUrl}
BAŞLIK: ${params.originalTitle}
ÖZET: ${params.originalSummary}
İÇERİK:
${content.slice(0, 4000)}
${params.forcedCategoryId ? `\nÖNERİLEN KATEGORİ: ${params.forcedCategoryId} (içerik farklı bir kategoriye işaret ediyorsa doğru kategoriyi seç, bu sadece öneridir)` : ''}

JSON şeması (tüm alanları doldur):
{
  "title": "string (60-90 karakter, clickbait olmayan, SEO uyumlu)",
  "shortTitle": "string (40-55 karakter, mobil için)",
  "slug": "string (URL-safe, Türkçe karakter yok)",
  "description": "string (tam haber içeriği, 400-800 kelime, HTML paragraflar \\n\\n ile ayrılmış)",
  "summary": "string (haber özeti, 120-160 karakter)",
  "spot": "string (gazetecilik lideri, Kim/Ne/Nerede/Ne zaman/Neden/Nasıl, 60-120 kelime)",
  "content": "string (tam haber, 400-1000 kelime, paragraflar \\n\\n ile)",
  "category": "string (son-dakika|gundem|siyaset|ekonomi|spor|teknoloji|saglik|dunya|kultur|magazin|bilim|yerel-haber|trend|canakkale)",
  "subCategory": "string veya null",
  "newsType": "string (breaking|feature|analysis|report|opinion|update)",
  "sentiment": "string (positive|negative|neutral)",
  "location": "string veya null (il adı)",
  "country": "string (varsayılan: Türkiye)",
  "language": "tr",
  "tags": ["string", ...] (5-8 etiket, Türkçe, küçük harf),
  "keywords": ["string", ...] (5-10 SEO anahtar kelime),
  "relatedTopics": ["string", ...] (3-5 ilgili konu),
  "metaTitle": "string (55-65 karakter, SEO başlık)",
  "metaDescription": "string (145-160 karakter, SEO açıklama)",
  "seoScore": number (0-100),
  "qualityScore": number (0-100),
  "factCheckScore": number (0-100),
  "readingTime": number (dakika cinsinden),
  "aiConfidence": number (0-100),
  "breakingNews": boolean,
  "featured": boolean,
  "isBreaking": boolean,
  "socialCaption": "string (genel sosyal medya metni, 280 karakter)",
  "twitterText": "string (Twitter/X için, 240 karakter, hashtag'li)",
  "facebookText": "string (Facebook için, 500 karakter, emoji dahil)",
  "instagramCaption": "string (Instagram için, 300 karakter, hashtag'li)",
  "pushNotification": "string (push bildirim, 100 karakter)",
  "pushTitle": "string (bildirim başlığı, 50 karakter)",
  "pushBody": "string (bildirim açıklaması, 100 karakter)",
  "editorNote": "string veya null (editör notu)",
  "thumbnailSuggestion": "string veya null (görsel açıklaması)"
}`
}

// ── API call ──────────────────────────────────────────────────────────────────
async function callGemini(prompt: string, systemPrompt: string): Promise<string> {
  const cfg = getConfig()
  if (!cfg) throw new Error('GEMINI_API_KEY eksik')

  const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${cfg.apiKey}`

  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }],
    },
    generationConfig: {
      temperature: 0.3,
      topP: 0.8,
      topK: 40,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Gemini API ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
      finishReason?: string
    }>
    error?: { message?: string }
  }

  if (data.error) throw new Error(`Gemini error: ${data.error.message}`)

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!text) throw new Error('Gemini boş yanıt döndürdü')

  return text
}

// ── Parse result ──────────────────────────────────────────────────────────────
function parseGeminiJson(raw: string): GeminiEditResult {
  // Strip markdown code fences if present
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

  const p = JSON.parse(cleaned) as Partial<GeminiEditResult> & Record<string, unknown>

  const str = (v: unknown, fallback = '') =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback
  const num = (v: unknown, fallback = 0) =>
    typeof v === 'number' ? Math.min(100, Math.max(0, v)) : fallback
  const bool = (v: unknown) => v === true
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []

  return {
    title: str(p.title, 'Haber Başlığı'),
    shortTitle: str(p.shortTitle, str(p.title, 'Başlık')).slice(0, 55),
    slug: str(p.slug, ''),
    description: str(p.description, str(p.content, '')),
    summary: str(p.summary, '').slice(0, 200),
    spot: str(p.spot, '').slice(0, 600),
    content: str(p.content, str(p.description, '')),
    category: str(p.category, 'gundem'),
    subCategory: str(p.subCategory) || undefined,
    newsType: (str(p.newsType, 'report') as GeminiEditResult['newsType']),
    sentiment: (str(p.sentiment, 'neutral') as GeminiEditResult['sentiment']),
    location: str(p.location) || undefined,
    country: str(p.country, 'Türkiye'),
    language: 'tr',
    tags: arr(p.tags).slice(0, 8),
    keywords: arr(p.keywords).slice(0, 10),
    relatedTopics: arr(p.relatedTopics).slice(0, 5),
    metaTitle: str(p.metaTitle, str(p.title, '')).slice(0, 65),
    metaDescription: str(p.metaDescription, str(p.summary, '')).slice(0, 165),
    seoScore: num(p.seoScore, 70),
    qualityScore: num(p.qualityScore, 70),
    factCheckScore: num(p.factCheckScore, 70),
    readingTime: typeof p.readingTime === 'number' ? Math.max(1, p.readingTime) : 3,
    aiConfidence: num(p.aiConfidence, 75),
    breakingNews: bool(p.breakingNews),
    featured: bool(p.featured),
    isBreaking: bool(p.isBreaking),
    socialCaption: str(p.socialCaption, '').slice(0, 300),
    twitterText: str(p.twitterText, '').slice(0, 240),
    facebookText: str(p.facebookText, '').slice(0, 500),
    instagramCaption: str(p.instagramCaption, '').slice(0, 300),
    pushNotification: str(p.pushNotification, '').slice(0, 120),
    pushTitle: str(p.pushTitle, str(p.shortTitle, '')).slice(0, 60),
    pushBody: str(p.pushBody, str(p.summary, '')).slice(0, 120),
    editorNote: str(p.editorNote) || undefined,
    thumbnailSuggestion: str(p.thumbnailSuggestion) || undefined,
    processedAt: Date.now(),
    modelUsed: GEMINI_MODEL,
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────
export interface GeminiEditInput {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  enrichedContent?: string
  forcedCategoryId?: string
}

export async function geminiEditArticle(input: GeminiEditInput): Promise<GeminiEditResult> {
  const prompt = buildPrompt(input)
  const raw = await callGemini(prompt, SYSTEM_PROMPT)
  return parseGeminiJson(raw)
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkGeminiHealth(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const start = Date.now()
  try {
    const cfg = getConfig()
    if (!cfg) return { ok: false, latencyMs: 0, error: 'GEMINI_API_KEY eksik' }

    const url = `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${cfg.apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'Merhaba' }] }],
        generationConfig: { maxOutputTokens: 10 },
      }),
    })
    return { ok: res.ok, latencyMs: Date.now() - start }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, error: String(err) }
  }
}
