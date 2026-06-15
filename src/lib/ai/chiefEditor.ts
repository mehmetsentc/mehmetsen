/**
 * Gemini 2.0 Flash — Genel Yayın Yönetmeni (Chief Editor)
 *
 * Pipeline'ın son aşaması. DeepSeek + Gemini editörünün hazırladığı haberi
 * bağımsız bir Genel Yayın Yönetmeni olarak inceler:
 *
 *   1. Kategori doğruluk kontrolü (few-shot örneklerle)
 *   2. İçerik kalite değerlendirmesi
 *   3. İnce içerikte → Google Search ile zenginleştirme (built-in, ücretsiz)
 *   4. Başlık / açıklama düzeltmesi
 *   5. Nihai yayın kararı: approved / needs_revision / rejected
 *
 * Env:
 *   GEMINI_API_KEY        — zorunlu (zaten mevcut)
 *   GEMINI_CHIEF_MODEL    — varsayılan: gemini-2.0-flash (google_search destekler)
 */

import type { GeminiEditResult } from './types'

const CHIEF_MODEL = process.env.GEMINI_CHIEF_MODEL?.trim() || 'gemini-2.0-flash'
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/** İçerik bu kelime sayısının altındaysa Google Search tetiklenir */
const SEARCH_MIN_WORDS = 150
/** Gemini kalite skoru bu değerin altındaysa Google Search tetiklenir */
const SEARCH_QUALITY_THRESHOLD = 55

export interface ChiefEditorResult {
  decision: 'approved' | 'needs_revision' | 'rejected'
  overallScore: number

  finalTitle: string
  finalDescription: string
  finalSummary: string
  finalCategory: string
  finalTags: string[]

  categoryConfidence: number
  contentQuality: number

  webSearchUsed: boolean
  searchQueries: string[]
  searchSources: string[]

  categoryReason: string
  issues: string[]
  pushTitle: string
  pushBody: string

  processedAt: number
  modelUsed: string
}

// ── System prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sen NaHaber'in Genel Yayın Yönetmeni'sin. Gemini editörünün işlediği haberi bağımsız olarak inceleyip nihai yayın kararını veriyorsun.

## TEMEL GÖREVLER
1. Kategoriyi doğrula, yanlışsa düzelt
2. İçerik kalitesini değerlendir
3. Gerekirse Google Search ile ek bilgi topla
4. Başlık/açıklama sorunlarını düzelt
5. Nihai kararı ver

## YAYIM KURALLARI
- APPROVED  : Güvenilir kaynak, yeterli içerik (≥100 kelime), doğrulanabilir bilgi, doğru kategori
- NEEDS_REVISION: Kategori yanlış, başlık sorunlu, içerik kısa ama gerçek
- REJECTED  : İçerik <80 kelime VE arama da sonuç vermedi; tamamen doğrulanamaz iddia

## MUTLAK YASAK
- Kaynakta OLMAYAN bilgi, kişi adı, şehir adı, rakam veya alıntı ekleme
- Google Search sonuçlarından yalnızca doğrulanmış, güvenilir bilgileri kullan
- Spekülatif veya uydurma içerik üretme
- Benzer bir olay başka şehirde yaşandıysa o şehir bilgisini bu habere AKTARMA
- Haberin şehri belirsizse şehir bilgisi EKLEME — belirsiz bırak veya REJECTED ver
- Habere yorum, kanaat, değerlendirme veya duygu yüklü ifade ekleme ("maalesef", "şaşırtıcı", "açıkça" vb. yasak)
- Atıf yapılmadan olgusal iddia sunma — kim söyledi, nereden alındı belirtilmeli
- Dramatik, propagandistik veya partizan dil kullanma

## KATEGORİ KURALLARI

**Kaynak adı (örn. "Sabah Spor", "Milliyet Magazin") kategoriyi BELİRLEMEZ. Haberin içeriği belirler.**

| İçerik ipuçları | Doğru kategori |
|---|---|
| Cumhurbaşkanı / meclis / seçim / bakan / siyasi parti | siyaset |
| Yabancı ülke / savaş / NATO / BM / uluslararası olay | dunya |
| Borsa / döviz / faiz / şirket / kripto / TÜİK raporu | ekonomi |
| Deprem ≥4.5 / büyük afet / darbe / suikast | son-dakika |
| Futbol maçı / gol / transfer / FIFA / UEFA / Süper Lig | futbol |
| Basketbol / NBA / EuroLeague | basketbol |
| Voleybol | voleybol |
| Yemek / tarif / restoran / şef / Michelin / mutfak | gastronomi |
| Araba / TOGG / elektrikli araç / yeni model tanıtımı | otomobil |
| Trafik kazası (tek şehir) | yerel-haber |
| iPhone / Android / yapay zeka / yazılım / siber güvenlik | teknoloji |
| Hastalık / ilaç / aşı / hastane / pandemi | saglik |
| Film vizyonu / Oscar / yönetmen / oyuncu (film haberi) | sinema |
| Konser / albüm / turne / müzik etkinliği | konser |
| Tiyatro oyunu / opera / bale | tiyatro |
| Kültür/sanat festivali / edebiyat / müze | festival veya kultur |
| Ünlünün ÖZEL HAYATI / ilişkisi / skandalı | magazin |
| Tek şehre/ilçeye özgü yerel haber | yerel-haber |
| Diğer Türkiye haberleri | gundem |

## FEW-SHOT ÖRNEKLER

**ÖRNEK 1** — Kaynak "Sabah Spor" ama içerik siyaset:
Başlık: "Erdoğan TBMM'de spor bütçesini sundu"
→ KATEGORİ: siyaset ✓ (cumhurbaşkanı meclis konuşması)

**ÖRNEK 2** — Kaynak "Milliyet Magazin" ama içerik yerel:
Başlık: "Çanakkale'de tarihi konağa yangın"
→ KATEGORİ: yerel-haber ✓

**ÖRNEK 3** — Yemek "kultur"a gitmiş:
Başlık: "Türk mutfağının incisi: Mantı nasıl yapılır?"
→ KATEGORİ: gastronomi ✓ (tarif içeriği — kultur değil)

**ÖRNEK 4** — Film vs özel hayat:
Başlık: "Kerem Bürsin'in yeni filmi Cannes'da ödül aldı"
→ KATEGORİ: sinema ✓ (film haberi — magazin değil)

**ÖRNEK 5** — Aynı ünlü, farklı içerik:
Başlık: "Kerem Bürsin ve Hande Erçel barıştı"
→ KATEGORİ: magazin ✓ (özel hayat haberi)

**ÖRNEK 6** — Merkez Bankası faiz kararı:
Başlık: "TCMB faizi %50'de sabit tuttu"
→ KATEGORİ: ekonomi ✓ (para politikası)

**ÖRNEK 7** — Uluslararası çatışma:
Başlık: "Gazze'de ateşkes görüşmeleri çöktü"
→ KATEGORİ: dunya ✓ (uluslararası — yerel veya gundem değil)

**ÖRNEK 8** — Tesla hissesi:
Başlık: "Tesla hisseleri %10 düştü"
→ KATEGORİ: ekonomi ✓ (borsa/hisse — teknoloji değil)

**ÖRNEK 9** — Masterchef:
Başlık: "Masterchef 2024 şampiyonu belli oldu"
→ KATEGORİ: gastronomi ✓ (yemek yarışması — magazin değil)

**ÖRNEK 10** — Trafik vs otomobil:
Başlık: "İzmir'de zincirleme kaza: 3 yaralı"
→ KATEGORİ: yerel-haber ✓ (tek şehir kazası — otomobil değil)

**ÖRNEK 11** — TOGG:
Başlık: "TOGG T10X ikinci seri üretimde"
→ KATEGORİ: otomobil ✓ (araç haberi — teknoloji değil)

**ÖRNEK 12** — Sağlık bakanlığı:
Başlık: "Yeni grip aşısı Ekim'den uygulanacak"
→ KATEGORİ: saglik ✓

## ÇIKTI FORMAT (yalnızca JSON)
{
  "decision": "approved|needs_revision|rejected",
  "overallScore": 0-100,
  "finalTitle": "string",
  "finalDescription": "string (tam haber, uydurmadan)",
  "finalSummary": "string (120-160 karakter)",
  "finalCategory": "string",
  "finalTags": ["string"],
  "categoryConfidence": 0-100,
  "contentQuality": 0-100,
  "categoryReason": "string",
  "issues": ["string"],
  "pushTitle": "string (max 50 karakter)",
  "pushBody": "string (max 100 karakter)"
}`

// ── Prompt builder ─────────────────────────────────────────────────────────────
function buildPrompt(article: GeminiEditResult, wordCount: number): string {
  const needsSearch = wordCount < SEARCH_MIN_WORDS || article.qualityScore < SEARCH_QUALITY_THRESHOLD

  return `Aşağıdaki haberi incele ve yayın kararı ver.

KAYNAK MODEL: ${article.modelUsed || 'Gemini'}
KELIME SAYISI: ${wordCount} ${wordCount < SEARCH_MIN_WORDS ? '⚠️ DÜŞÜK — Google Search kullan' : '✓'}
KALİTE SKORU: ${article.qualityScore}/100 ${article.qualityScore < SEARCH_QUALITY_THRESHOLD ? '⚠️ DÜŞÜK — Google Search kullan' : '✓'}
MEVCUT KATEGORİ: ${article.category}
${needsSearch ? '\n⚠️ İçerik yetersiz — Google Search aracını kullanarak haberi zenginleştir.\n' : ''}
---
BAŞLIK: ${article.title}
ÖZET: ${article.summary}
İÇERİK:
${(article.content || article.description || '').slice(0, 3000)}

ETİKETLER: ${(article.tags ?? []).join(', ')}
KONUM: ${article.location || 'belirtilmemiş'}
---

1. Kategoriyi örneklerdeki kurallara göre doğrula
2. ${needsSearch ? 'Google Search ile haber hakkında güncel bilgi topla' : 'İçerik yeterli, aramaya gerek yok'}
3. JSON formatında nihai karar ver`
}

// ── Gemini API call (with google_search grounding) ─────────────────────────────
async function callGeminiChief(prompt: string): Promise<{
  text: string
  searchUsed: boolean
  searchQueries: string[]
  searchSources: string[]
}> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) throw new Error('GEMINI_API_KEY eksik')

  const url = `${GEMINI_BASE}/${CHIEF_MODEL}:generateContent?key=${apiKey}`

  const body = {
    contents: [
      { role: 'user', parts: [{ text: prompt }] },
    ],
    systemInstruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    tools: [
      { google_search: {} },
    ],
    generationConfig: {
      temperature: 0.15,
      topP: 0.8,
      maxOutputTokens: 2048,
      // Not: google_search aktifken responseMimeType: 'application/json' kullanılamaz
      // JSON'u manuel parse edeceğiz
    },
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45_000),
  })

  if (!res.ok) {
    const err = await res.text().catch(() => '')
    throw new Error(`Gemini Chief API ${res.status}: ${err.slice(0, 300)}`)
  }

  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
      groundingMetadata?: {
        webSearchQueries?: string[]
        groundingChunks?: Array<{
          web?: { uri?: string; title?: string }
        }>
      }
    }>
    error?: { message?: string }
  }

  if (data.error) throw new Error(`Gemini Chief error: ${data.error.message}`)

  const candidate = data.candidates?.[0]
  const text = candidate?.content?.parts?.map(p => p.text ?? '').join('').trim() ?? ''
  const grounding = candidate?.groundingMetadata

  const searchUsed = Boolean(grounding?.webSearchQueries?.length)
  const searchQueries = grounding?.webSearchQueries ?? []
  const searchSources = (grounding?.groundingChunks ?? [])
    .map(c => c.web?.uri ?? '')
    .filter(Boolean)

  return { text, searchUsed, searchQueries, searchSources }
}

// ── JSON extraction from Gemini text (no markdown fences) ─────────────────────
function extractJson(raw: string): string {
  // JSON kod bloğu içindeyse çıkar
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenceMatch?.[1]) return fenceMatch[1].trim()

  // Direkt JSON objesi ara
  const objMatch = raw.match(/\{[\s\S]*\}/)
  if (objMatch) return objMatch[0]

  return raw.trim()
}

// ── Main export ────────────────────────────────────────────────────────────────
export interface ChiefEditorInput extends GeminiEditResult {
  originalTitle?: string
  sourceLabel?: string
}

export async function runChiefEditor(
  article: ChiefEditorInput
): Promise<ChiefEditorResult> {
  const wordCount = (article.content || article.description || '')
    .trim().split(/\s+/).filter(Boolean).length

  const prompt = buildPrompt(article, wordCount)

  try {
    const { text, searchUsed, searchQueries, searchSources } =
      await callGeminiChief(prompt)

    const cleaned = extractJson(text)
    const p = JSON.parse(cleaned) as Record<string, unknown>

    const str = (v: unknown, fallback = '') =>
      typeof v === 'string' && v.trim() ? v.trim() : fallback
    const num = (v: unknown, fallback = 70) =>
      typeof v === 'number' ? Math.min(100, Math.max(0, v)) : fallback
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : []

    const decision = (['approved', 'needs_revision', 'rejected'] as const)
      .includes(p.decision as never)
      ? (p.decision as ChiefEditorResult['decision'])
      : 'approved'

    return {
      decision,
      overallScore: num(p.overallScore, 75),
      finalTitle: str(p.finalTitle, article.title),
      finalDescription: str(p.finalDescription, article.content || article.description),
      finalSummary: str(p.finalSummary, article.summary).slice(0, 200),
      finalCategory: str(p.finalCategory, article.category),
      finalTags: arr(p.finalTags).length > 0 ? arr(p.finalTags) : (article.tags ?? []),
      categoryConfidence: num(p.categoryConfidence, 80),
      contentQuality: num(p.contentQuality, 70),
      webSearchUsed: searchUsed,
      searchQueries,
      searchSources,
      categoryReason: str(p.categoryReason),
      issues: arr(p.issues),
      pushTitle: str(p.pushTitle, article.pushTitle).slice(0, 60),
      pushBody: str(p.pushBody, article.pushBody).slice(0, 120),
      processedAt: Date.now(),
      modelUsed: CHIEF_MODEL,
    }
  } catch (err) {
    // Fallback — Gemini hata verirse basit karar
    console.warn('[chiefEditor] Gemini Chief hatası, fallback:', err instanceof Error ? err.message : err)
    const score = Math.round(((article.qualityScore ?? 50) + (article.seoScore ?? 50)) / 2)
    return {
      decision: score >= 45 ? 'approved' : 'rejected',
      overallScore: score,
      finalTitle: article.title,
      finalDescription: article.content || article.description,
      finalSummary: article.summary,
      finalCategory: article.category,
      finalTags: article.tags ?? [],
      categoryConfidence: 65,
      contentQuality: article.qualityScore ?? 50,
      webSearchUsed: false,
      searchQueries: [],
      searchSources: [],
      categoryReason: 'fallback — chief editor yanıt alınamadı',
      issues: [err instanceof Error ? err.message : String(err)],
      pushTitle: article.pushTitle,
      pushBody: article.pushBody,
      processedAt: Date.now(),
      modelUsed: `${CHIEF_MODEL}-fallback`,
    }
  }
}

// ── Config check ───────────────────────────────────────────────────────────────
export function isChiefEditorConfigured(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}

export async function checkChiefEditorHealth(): Promise<{
  ok: boolean
  latencyMs: number
  model: string
  webSearchEnabled: boolean
  error?: string
}> {
  const start = Date.now()
  try {
    const apiKey = process.env.GEMINI_API_KEY?.trim()
    if (!apiKey) {
      return { ok: false, latencyMs: 0, model: CHIEF_MODEL, webSearchEnabled: false, error: 'GEMINI_API_KEY eksik' }
    }
    const url = `${GEMINI_BASE}/${CHIEF_MODEL}:generateContent?key=${apiKey}`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: 'test' }] }],
        generationConfig: { maxOutputTokens: 5 },
      }),
      signal: AbortSignal.timeout(8_000),
    })
    return { ok: res.ok, latencyMs: Date.now() - start, model: CHIEF_MODEL, webSearchEnabled: true }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, model: CHIEF_MODEL, webSearchEnabled: false, error: String(err) }
  }
}
