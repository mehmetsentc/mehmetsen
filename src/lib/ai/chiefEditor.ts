/**
 * GPT-4o — Genel Yayın Yönetmeni (Chief Editor)
 *
 * Pipeline'ın son aşaması. DeepSeek + Gemini'nin hazırladığı haberi
 * inceleyip şunları yapar:
 *   1. Kategori doğruluk kontrolü (few-shot örneklerle)
 *   2. İçerik kalite değerlendirmesi
 *   3. İnce içerikte → Tavily web araması ile zenginleştirme
 *   4. Başlık / açıklama düzeltmesi
 *   5. Nihai yayın kararı: approved / needs_revision / rejected
 *
 * Env vars:
 *   OPENAI_API_KEY    — zorunlu
 *   OPENAI_CHIEF_MODEL — varsayılan: gpt-4o
 *   TAVILY_API_KEY    — isteğe bağlı, yoksa web araması atlanır
 */

import type { GeminiEditResult } from './types'

// ── Config ────────────────────────────────────────────────────────────────────
const CHIEF_MODEL = process.env.OPENAI_CHIEF_MODEL?.trim() || 'gpt-4o'
const OPENAI_BASE = 'https://api.openai.com/v1/chat/completions'
const TAVILY_BASE = 'https://api.tavily.com/search'

/** Gemini kalite skoru bu değerin altındaysa web araması tetiklenir */
const WEB_SEARCH_QUALITY_THRESHOLD = 55
/** İçerik bu kelime sayısının altındaysa web araması tetiklenir */
const WEB_SEARCH_MIN_WORDS = 150
/** Maksimum tool call döngüsü (sonsuz döngü koruması) */
const MAX_TOOL_ITERATIONS = 3

export interface ChiefEditorResult {
  decision: 'approved' | 'needs_revision' | 'rejected'
  overallScore: number           // 0–100

  // Nihai içerik (Gemini'ninkinden farklı olabilir)
  finalTitle: string
  finalDescription: string
  finalSummary: string
  finalCategory: string
  finalTags: string[]

  // Puanlar
  categoryConfidence: number     // 0–100
  contentQuality: number         // 0–100

  // Web arama
  webSearchUsed: boolean
  searchQueries: string[]
  searchSources: string[]

  // Editör notları
  categoryReason: string
  issues: string[]
  pushTitle: string
  pushBody: string

  processedAt: number
  modelUsed: string
}

// ── Tavily web search ─────────────────────────────────────────────────────────
interface TavilyResult {
  title: string
  url: string
  content: string
  score: number
}

async function tavilySearch(query: string): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY?.trim()
  if (!apiKey) return []

  try {
    const res = await fetch(TAVILY_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        search_depth: 'basic',
        include_answer: false,
        include_raw_content: false,
        max_results: 5,
        include_domains: [],
        exclude_domains: [],
      }),
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return []
    const data = (await res.json()) as { results?: TavilyResult[] }
    return data.results ?? []
  } catch {
    return []
  }
}

// ── System prompt (few-shot örnekler dahil) ───────────────────────────────────
const SYSTEM_PROMPT = `Sen NaHaber'in Genel Yayın Yönetmeni'sin. DeepSeek ve Gemini'nin işlediği haberi son kez inceleyip yayın kararı veriyorsun.

## TEMEL GÖREVLER
1. Kategoriyi doğrula ve gerekirse düzelt
2. İçerik kalitesini değerlendir
3. Başlık/açıklama sorunlarını düzelt
4. Nihai yayın kararını ver

## YAYIM KURALLARI
- APPROVED: Güvenilir kaynak, yeterli içerik (≥150 kelime), doğrulanabilir bilgi, doğru kategori
- NEEDS_REVISION: Kategori yanlış, başlık clickbait veya kötü, içerik kısa ama gerçek
- REJECTED: İçerik <80 kelime VE web araması da başarısız, tamamen belirsiz/doğrulanamaz iddia

## MUTLAK YASAK
- Kaynakta OLMAYAN bilgi, kişi adı, rakam veya alıntı ekleme
- Web aramasıyla bulunan bilgiyi de sadece gerçekleşmiş, doğrulanmış kaynaklara dayanarak kullan
- Spekülatif içerik üretme

## KATEGORİ KURALLARI

**Kaynak adı kategoriyi BELİRLEMEZ.** "Sabah Spor" kaynağından gelse bile siyasi içerik → siyaset kategorisine gider.

### Kategori hiyerarşisi (üstteki öncelikli):
| İçerik ipuçları | Doğru kategori |
|---|---|
| Cumhurbaşkanı / meclis / seçim / bakan / siyasi parti açıklaması | siyaset |
| Yabancı ülke / savaş / NATO / BM / uluslararası | dunya |
| Borsa / döviz / faiz / şirket / kripto / TÜİK ekonomi raporu | ekonomi |
| Deprem / büyük afet (≥4.5) / darbe / suikast — ACİL | son-dakika |
| Futbol maçı / gol / transfer / FIFA / UEFA / Süper Lig | futbol |
| Basketbol / NBA / EuroLeague | basketbol |
| Voleybol / CEV / FIVB | voleybol |
| Yemek / tarif / restoran / şef / Michelin / gastronomi | gastronomi |
| Araba / TOGG / elektrikli araç / trafik kazası / yeni model | otomobil |
| iPhone / Android / yapay zeka / yazılım / ChatGPT / siber | teknoloji |
| Hastalık / ilaç / aşı / hastane / pandemi | saglik |
| Film vizyonu / Oscar / yönetmen / oyuncu (film haberi) | sinema |
| Konser / albüm / turne | konser |
| Tiyatro oyunu / opera / bale | tiyatro |
| Kültür festivali / edebiyat / müze | festival veya kultur |
| Ünlünün ÖZEL HAYATI / ilişkisi / skandalı / dedikodsu | magazin |
| Tek bir şehre/ilçeye özgü yerel haber | yerel-haber |
| Diğer Türkiye haberleri | gundem |

## FEW-SHOT ÖRNEKLER (Doğru kategori kararları)

**ÖRNEK 1 — Kaynak "Sabah Spor" ama içerik siyaset:**
Başlık: "Erdoğan: Türkiye sporda dünya şampiyonu olacak"
İçerik: Cumhurbaşkanı Erdoğan TBMM'de Spor Bakanlığı bütçesini sunarken konuştu...
→ KATEGORİ: siyaset (cumhurbaşkanı meclis konuşması)

**ÖRNEK 2 — Kaynak "Milliyet Magazin" ama içerik yerel haber:**
Başlık: "Çanakkale'de tarihi konağa yangin"
İçerik: Dün gece Çanakkale merkeze bağlı Kepez köyünde...
→ KATEGORİ: yerel-haber (tek şehir, yerel olay)

**ÖRNEK 3 — Yemek içeriği yanlış "kultur"a gitmiş:**
Başlık: "Türk mutfağının incisi: Mantı nasıl yapılır?"
İçerik: Ev yapımı mantı tarifi, malzemeler ve püf noktaları...
→ KATEGORİ: gastronomi (yemek tarifi — kultur değil)

**ÖRNEK 4 — Ünlünün filmi vs özel hayatı:**
Başlık: "Kerem Bürsin'in yeni filmi Cannes'da ödül aldı"
İçerik: Oyuncu Kerem Bürsin'in başrolü oynadığı drama filmi Cannes'da...
→ KATEGORİ: sinema (film haberi — magazin değil)

**ÖRNEK 5 — Aynı ünlü, farklı içerik:**
Başlık: "Kerem Bürsin ve Hande Erçel barıştı"
İçerik: Çiftin el ele görüntüleri sosyal medyada...
→ KATEGORİ: magazin (özel hayat / ilişki haberi)

**ÖRNEK 6 — Ekonomi vs siyaset ayrımı:**
Başlık: "Merkez Bankası faizi sabit tuttu: %50"
İçerik: TCMB Para Politikası Kurulu toplantısında faiz...
→ KATEGORİ: ekonomi (merkez bankası kararı, para politikası)

**ÖRNEK 7 — Uluslararası siyasi haber:**
Başlık: "Gazze'de ateşkes görüşmeleri çöktü"
İçerik: Katar'daki müzakereler Hamas ve İsrail...
→ KATEGORİ: dunya (uluslararası çatışma) — yerel-haber veya gundem değil

**ÖRNEK 8 — Teknoloji vs ekonomi:**
Başlık: "Tesla hisseleri %10 düştü"
İçerik: Elektrikli araç üreticisi Tesla'nın hisseleri Wall Street'te...
→ KATEGORİ: ekonomi (borsa/hisse haberi — teknoloji değil)

**ÖRNEK 9 — Masterchef vs magazin:**
Başlık: "Masterchef 2024 şampiyonu belli oldu"
İçerik: Yarışmanın finalinde şef adayları son nefese kadar...
→ KATEGORİ: gastronomi (yemek yarışması — magazin değil)

**ÖRNEK 10 — Trafik kazası:**
Başlık: "İzmir'de zincirleme kaza: 3 yaralı"
İçerik: Buca ilçesinde meydana gelen trafik kazasında...
→ KATEGORİ: yerel-haber (tek şehir — otomobil değil)

**ÖRNEK 11 — TOGG vs trafik:**
Başlık: "TOGG T10X ikinci seri üretimde"
İçerik: Yerli otomobil TOGG'un yeni modeli banttan indi...
→ KATEGORİ: otomobil (araç haberi)

**ÖRNEK 12 — Sağlık bakanlığı açıklaması:**
Başlık: "Yeni grip aşısı Ekim'den itibaren uygulanacak"
İçerik: Sağlık Bakanlığı, bu yıl mevsimsel grip aşısını...
→ KATEGORİ: saglik

## ÇIKTI FORMAT
JSON döndür:
{
  "decision": "approved|needs_revision|rejected",
  "overallScore": 0-100,
  "finalTitle": "string",
  "finalDescription": "string (tam haber — uydurmadan)",
  "finalSummary": "string (120-160 karakter)",
  "finalCategory": "string",
  "finalTags": ["string"],
  "categoryConfidence": 0-100,
  "contentQuality": 0-100,
  "categoryReason": "string (neden bu kategori?)",
  "issues": ["string"],
  "pushTitle": "string (50 karakter)",
  "pushBody": "string (100 karakter)"
}`

// ── Tool definitions ───────────────────────────────────────────────────────────
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Haber içeriği ince veya eksikse internette arama yap. Türkçe sorgu kullan.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Arama sorgusu (Türkçe, maksimum 120 karakter)',
          },
        },
        required: ['query'],
      },
    },
  },
]

// ── API call (with tool-call loop) ────────────────────────────────────────────
interface OpenAiMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

async function callOpenAi(messages: OpenAiMessage[]): Promise<{
  content: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
}> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY eksik')

  const hasTavily = Boolean(process.env.TAVILY_API_KEY?.trim())

  const res = await fetch(OPENAI_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CHIEF_MODEL,
      messages,
      temperature: 0.15,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
      // Sadece Tavily varsa web search aracını ver
      ...(hasTavily ? { tools: TOOLS, tool_choice: 'auto' } : {}),
    }),
    signal: AbortSignal.timeout(45_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`OpenAI Chief API ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: string | null
        tool_calls?: Array<{
          id: string
          type: 'function'
          function: { name: string; arguments: string }
        }>
      }
    }>
    error?: { message?: string }
  }

  if (data.error) throw new Error(`OpenAI error: ${data.error.message}`)

  const choice = data.choices?.[0]?.message
  return {
    content: choice?.content ?? null,
    tool_calls: choice?.tool_calls,
  }
}

// ── Build user prompt ─────────────────────────────────────────────────────────
function buildUserPrompt(
  article: GeminiEditResult,
  contentWordCount: number
): string {
  const needsSearch =
    contentWordCount < WEB_SEARCH_MIN_WORDS ||
    article.qualityScore < WEB_SEARCH_QUALITY_THRESHOLD

  return `Aşağıdaki haberi incele ve yayın kararı ver.

## HABERİN DURUMU
- Kaynak: ${article.modelUsed || 'Gemini'}
- Kelime sayısı: ${contentWordCount} ${contentWordCount < WEB_SEARCH_MIN_WORDS ? '⚠️ DÜŞÜK' : '✓'}
- Kalite skoru (Gemini): ${article.qualityScore}/100 ${article.qualityScore < WEB_SEARCH_QUALITY_THRESHOLD ? '⚠️ DÜŞÜK' : '✓'}
- Mevcut kategori: ${article.category}
${needsSearch ? '\n⚠️ İçerik yetersiz — web araması yaparak zenginleştir.' : ''}

## HABERİN İÇERİĞİ
BAŞLIK: ${article.title}
ÖZET: ${article.summary}
İÇERİK:
${article.content.slice(0, 3000)}

ETİKETLER: ${article.tags.join(', ')}
KONUM: ${article.location || 'belirtilmemiş'}

## GÖREV
1. Kategoriyi kontrol et (örneklerdeki kurallara göre)
2. ${needsSearch ? 'İçerik ince → web_search aracını kullan, en az 1 arama yap' : 'İçerik yeterli — aramaya gerek yok'}
3. JSON formatında nihai karar ver`
}

// ── Main function ─────────────────────────────────────────────────────────────
export interface ChiefEditorInput extends GeminiEditResult {
  originalTitle?: string
  sourceLabel?: string
}

export async function runChiefEditor(
  article: ChiefEditorInput
): Promise<ChiefEditorResult> {
  const startTime = Date.now()
  const searchQueries: string[] = []
  const searchSources: string[] = []
  let webSearchUsed = false

  const contentWordCount = (article.content || '').trim().split(/\s+/).filter(Boolean).length

  const messages: OpenAiMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(article, contentWordCount) },
  ]

  // ── Tool-call loop ─────────────────────────────────────────────────────────
  let iterations = 0
  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++
    const response = await callOpenAi(messages)

    // Tool calls → execute web search
    if (response.tool_calls && response.tool_calls.length > 0) {
      // Add assistant message with tool_calls
      messages.push({
        role: 'assistant',
        content: response.content,
        tool_calls: response.tool_calls,
      })

      // Execute each tool call
      for (const tc of response.tool_calls) {
        if (tc.function.name === 'web_search') {
          const args = JSON.parse(tc.function.arguments) as { query?: string }
          const query = args.query?.trim() || article.title
          searchQueries.push(query)

          const results = await tavilySearch(query)
          webSearchUsed = results.length > 0

          const resultText = results.length > 0
            ? results.map((r, i) =>
                `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content.slice(0, 400)}`
              ).join('\n\n')
            : 'Sonuç bulunamadı.'

          searchSources.push(...results.map(r => r.url))

          messages.push({
            role: 'tool',
            content: resultText,
            tool_call_id: tc.id,
          })
        }
      }
      // Continue loop — let GPT process search results
      continue
    }

    // No more tool calls — parse final JSON response
    const raw = response.content?.trim() ?? ''
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()

    try {
      const p = JSON.parse(cleaned) as Record<string, unknown>

      const str = (v: unknown, fallback = '') =>
        typeof v === 'string' && v.trim() ? v.trim() : fallback
      const num = (v: unknown, fallback = 70) =>
        typeof v === 'number' ? Math.min(100, Math.max(0, v)) : fallback
      const arr = (v: unknown): string[] =>
        Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : []

      const decision = (['approved', 'needs_revision', 'rejected'] as const).includes(
        p.decision as never
      )
        ? (p.decision as ChiefEditorResult['decision'])
        : 'approved'

      return {
        decision,
        overallScore: num(p.overallScore, 75),
        finalTitle: str(p.finalTitle, article.title),
        finalDescription: str(p.finalDescription, article.content || article.description),
        finalSummary: str(p.finalSummary, article.summary).slice(0, 200),
        finalCategory: str(p.finalCategory, article.category),
        finalTags: arr(p.finalTags).length > 0 ? arr(p.finalTags) : article.tags,
        categoryConfidence: num(p.categoryConfidence, 80),
        contentQuality: num(p.contentQuality, 70),
        webSearchUsed,
        searchQueries,
        searchSources,
        categoryReason: str(p.categoryReason, ''),
        issues: arr(p.issues),
        pushTitle: str(p.pushTitle, article.pushTitle).slice(0, 60),
        pushBody: str(p.pushBody, article.pushBody).slice(0, 120),
        processedAt: Date.now(),
        modelUsed: CHIEF_MODEL,
      }
    } catch {
      // JSON parse hatası → fallback
      break
    }
  }

  // Fallback (loop bitti veya parse hatası)
  console.warn(`[chiefEditor] Fallback kararı kullanıldı (${iterations} iterasyon)`)
  const score = Math.round((article.qualityScore + article.seoScore) / 2)
  return {
    decision: score >= 45 ? 'approved' : 'rejected',
    overallScore: score,
    finalTitle: article.title,
    finalDescription: article.content || article.description,
    finalSummary: article.summary,
    finalCategory: article.category,
    finalTags: article.tags,
    categoryConfidence: 70,
    contentQuality: article.qualityScore,
    webSearchUsed,
    searchQueries,
    searchSources,
    categoryReason: 'Fallback karar',
    issues: ['Chief editor yanıt alınamadı, fallback kullanıldı'],
    pushTitle: article.pushTitle,
    pushBody: article.pushBody,
    processedAt: Date.now(),
    modelUsed: `${CHIEF_MODEL}-fallback`,
  }
}

// ── Health check ───────────────────────────────────────────────────────────────
export function isChiefEditorConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim())
}

export async function checkChiefEditorHealth(): Promise<{
  ok: boolean
  latencyMs: number
  model: string
  webSearchEnabled: boolean
  error?: string
}> {
  const start = Date.now()
  const webSearchEnabled = Boolean(process.env.TAVILY_API_KEY?.trim())

  try {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      return { ok: false, latencyMs: 0, model: CHIEF_MODEL, webSearchEnabled, error: 'OPENAI_API_KEY eksik' }
    }

    const res = await fetch('https://api.openai.com/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    })

    return { ok: res.ok, latencyMs: Date.now() - start, model: CHIEF_MODEL, webSearchEnabled }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, model: CHIEF_MODEL, webSearchEnabled, error: String(err) }
  }
}
