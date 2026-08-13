/**
 * AI Ana Editör (Chief Editor) — newsroom pipeline final gate.
 *
 * Runs after rewrite + category/geo enrichment, before publish decision.
 * DeepSeek V4 with full DEFAULT_CATEGORIES knowledge.
 *
 * Decisions:
 *   publish — high confidence, quality OK → auto-publish + needsReview (CMS İnceleme)
 *   hold    — unsure category/quality → pending_review draft (Onay Bekliyor)
 *   reject  — spam, too short, unfixable quality → skip
 *   duplicate → tekrarlayan, never publish
 */
import {
  DEFAULT_CATEGORIES,
  TEKRARLAYAN_CATEGORY_ID,
  getYerelSubcategoryIdsForPrompt,
} from '@/constants/config'
import { applyAstrologyCategoryOverride } from '@/lib/categoryOverrides'
import { deepseekChatCompletion, getDeepSeekApiKey, getDeepSeekModel } from '@/lib/ai/deepseekClient'
import {
  CHIEF_EDITOR_AUTO_PUBLISH,
  CHIEF_EDITOR_CONFIDENCE_THRESHOLD,
} from '@/services/newsroom/config'
import {
  computeArticleSimilarity,
  SIMILARITY_THRESHOLD,
} from '@/services/newsroom/dedupe/similarityEngine'

const VALID_CATEGORY_IDS = new Set(
  DEFAULT_CATEGORIES.filter((c) => c.id !== TEKRARLAYAN_CATEGORY_ID).map((c) => c.id),
)

export type ChiefEditorDecision = 'publish' | 'hold' | 'reject'

export interface ChiefEditorInput {
  title: string
  spot?: string
  summary: string
  description: string
  categoryId: string
  categoryConfidence: number
  tags: string[]
  sourceLabel?: string
  sourceUrl?: string
  originalTitle?: string
  city?: string | null
  district?: string | null
  country?: string
  isBreaking?: boolean
  factCheckScore?: number
  wordCount?: number
  recentTitles?: string[]
}

export interface ChiefEditorResult {
  decision: ChiefEditorDecision
  isDuplicate: boolean
  categoryId: string
  categoryConfidence: number
  categoryReason: string
  overallScore: number
  contentQuality: number
  issues: string[]
  finalTitle: string
  finalSummary: string
  finalTags: string[]
  modelUsed: string
}

function buildCategoryPromptBlock(): string {
  const lines = DEFAULT_CATEGORIES
    .filter((c) => c.id !== TEKRARLAYAN_CATEGORY_ID)
    .map((c) => {
      const parent = c.parentId ? ` (alt: ${c.parentId})` : ''
      return `  - ${c.id}: ${c.name}${parent}`
    })
  return lines.join('\n')
}

const SYSTEM_PROMPT = `Sen NaHaber'in Genel Yayın Yönetmeni'sin (Ana Editör). Yeniden yazılmış haberi bağımsız inceleyip nihai kategori ve yayın kararını veriyorsun.

## GÖREV
1. Kategoriyi doğrula veya düzelt — TÜM kategori listesinden en spesifik doğru olanı seç
2. İçerik kalitesini değerlendir (başlık, spot, gövde, eksik cümle)
3. Duplikasyon kontrolü — aynı olay daha önce yayınlandı mı?
4. Nihai karar: publish | hold | reject

## YAYIN KARARLARI
- publish: Güvenilir kaynak, ≥200 kelime, doğrulanabilir, doğru kategori, categoryConfidence ≥75
- hold: Kategori belirsiz (55-74 güven), içerik sınırda (120-199 kelime), küçük başlık sorunu
- reject: <120 kelime, clickbait/spam, tamamen doğrulanamaz, yarım cümle/kesik paragraf
- isDuplicate=true → decision=reject, finalCategory=tekrarlayan — ASLA yayınlama

## DUPLİKASYON (tekrarlayan)
- RECENT_TITLES listesinde aynı olayı anlatan başlık varsa → isDuplicate: true
- Aynı olay: aynı maç skoru, aynı siyasi karar, aynı kişi aynı eylem, aynı şirket aynı duyuru
- Farklı açı/gelişme/röportaj → isDuplicate: false
- Duplikat haberler tekrarlayan kategorisine gider, YAYINLANMAZ

## SPOR — SÜPER LİG / 1. LİG
- Süper Lig, Trendyol Süper Lig, 1. Lig, TFF 1. Lig maç/transfer/puan → futbol
- Galatasaray, Fenerbahçe, Beşiktaş, Trabzonspor, Başakşehir vb. profesyonel lig → futbol
- Yerel amatör/küme maçı tek şehirde → branşa göre yerel-futbol / yerel-basketbol / yerel-voleybol / …; belirsizse yerel-spor
- Basketbol → basketbol, Voleybol → voleybol (futbol ile karıştırma)

## YEREL vs ULUSAL (EN KRİTİK — konu şehri ezmesin)
YEREL BİRİNCİL → yerel-* (city ile):
- Başlıkta tek şehir ("Van'da", "Yalova'da", ilçe adı) + yerel kapsam
- Belediye / valilik / kaymakam / ilçe istatistik / yerel etkinlik / yerel çevre
- "Van'da konut satışları" → yerel-emlak (emlak-konut DEĞİL)
- "Van Gölü atık toplama" → yerel-cevre-iklim (cevre-iklim DEĞİL)
- "Yalova sağlık etkinliği" → yerel-saglik (saglik DEĞİL)
- "Çiftlikköy kent mobilyası" → yerel-yasam veya yerel-gundem
- "Çayıralan yöresel lezzet" → yerel-gastronomi

ULUSAL BİRİNCİL → ulusal kategori (şehir yalnızca konumsa OK):
- Türkiye geneli, çok şehir, bakanlık/politika, TCMB/piyasa, ulusal yasa
- "Türkiye genelinde konut satışları" → emlak-konut
- "Sağlık Bakanlığı aşı takvimi" → saglik

## YEREL ALT KATEGORİLER
Tek il/ilçe olayı için genel yerel-haber KULLANMA — en uygun yerel alt kategoriyi seç:
${getYerelSubcategoryIdsForPrompt().split('|').map((id) => `  - ${id}`).join('\n')}

## KATEGORİ KURALLARI (kaynak adı kategoriyi BELİRLEMEZ)
| İçerik ipuçları | Doğru kategori |
|---|---|
| Cumhurbaşkanı / TBMM / seçim / bakan / parti | siyaset |
| Yabancı ülke / savaş / NATO / BM | dunya |
| KKTC / Lefkoşa / Gazimağusa | kibris-haberleri |
| Borsa / döviz / faiz / TCMB / hisse | finans-piyasa veya borsa |
| Kripto / Bitcoin / blockchain | kripto |
| Deprem ≥4.5 / darbe / suikast / büyük afet | son-dakika |
| Futbol / Süper Lig / gol / transfer / FIFA / UEFA | futbol |
| Basketbol / NBA / EuroLeague / BSL | basketbol |
| Voleybol / Sultanlar Ligi / Efeler Ligi | voleybol |
| Yemek / tarif / restoran / şef (ulusal) | gastronomi |
| Tek şehir yöresel yemek | yerel-gastronomi |
| Araba / TOGG / yeni model (kaza değil) | otomobil |
| Tek şehir trafik kazası / suç / yangın | yerel-asayis veya yerel-gundem |
| Tek şehir konut/emlak istatistiği | yerel-emlak |
| Tek şehir sağlık etkinliği | yerel-saglik |
| Tek şehir çevre temizliği / göl | yerel-cevre-iklim |
| Belediye/kaymakamlık duyurusu / ilan | yerel-duyuru |
| iPhone / AI / yazılım / siber | teknoloji |
| Burç / astroloji / günlük burç | astroloji (yasam DEĞİL) |
| Ünlü özel hayatı / skandal | magazin |
| Film / vizyon / Oscar | sinema |

## YASAK
- Kaynakta olmayan bilgi/kişi/şehir/rakam ekleme
- Spekülatif veya uydurma içerik
- Belirsiz şehir bilgisi ekleme
- Yorum/kanaat ("maalesef", "şaşırtıcı")
- Yarım cümle, kesik kelime, bağlaçla biten paragraf

## TÜM GEÇERLİ KATEGORİLER
${buildCategoryPromptBlock()}

## ÇIKTI (yalnızca JSON)
{
  "decision": "publish|hold|reject",
  "isDuplicate": false,
  "finalCategory": "kategori-id",
  "categoryConfidence": 0-100,
  "categoryReason": "string",
  "overallScore": 0-100,
  "contentQuality": 0-100,
  "finalTitle": "string",
  "finalSummary": "string (120-160 karakter)",
  "finalTags": ["string"],
  "issues": ["string"]
}`

function normalizeCategory(raw: string, title: string, body: string, tags: string[]): string {
  const id = raw.trim().toLowerCase().replace(/\s+/g, '-')
  if (VALID_CATEGORY_IDS.has(id)) {
    return applyAstrologyCategoryOverride(id, title, body, tags)
  }
  // Super Lig fallback heuristic
  const text = `${title} ${body}`.toLocaleLowerCase('tr-TR')
  if (/süper lig|super lig|trendyol süper|1\. lig|tff 1\. lig/.test(text)) return 'futbol'
  return 'gundem'
}

function parseResult(
  raw: string,
  input: ChiefEditorInput,
  model: string,
): ChiefEditorResult {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const p = JSON.parse(cleaned) as Record<string, unknown>

  const str = (v: unknown, fallback = '') =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback
  const num = (v: unknown, fallback = 70) =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : fallback
  const arr = (v: unknown): string[] =>
    Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : []

  const isDuplicate = p.isDuplicate === true
  const rawCategory = isDuplicate ? TEKRARLAYAN_CATEGORY_ID : str(p.finalCategory, input.categoryId)
  const categoryId = normalizeCategory(rawCategory, input.title, input.description, input.tags)
  const categoryConfidence = num(p.categoryConfidence, input.categoryConfidence)
  const overallScore = num(p.overallScore, 70)
  const contentQuality = num(p.contentQuality, 70)

  let decision: ChiefEditorDecision
  if (isDuplicate) {
    decision = 'reject'
  } else {
    const rawDecision = str(p.decision, 'hold')
    decision = (['publish', 'hold', 'reject'] as const).includes(rawDecision as ChiefEditorDecision)
      ? (rawDecision as ChiefEditorDecision)
      : 'hold'
  }

  return {
    decision,
    isDuplicate,
    categoryId,
    categoryConfidence,
    categoryReason: str(p.categoryReason, isDuplicate ? 'duplikat tespit' : ''),
    overallScore,
    contentQuality,
    issues: arr(p.issues),
    finalTitle: str(p.finalTitle, input.title),
    finalSummary: str(p.finalSummary, input.summary).slice(0, 200),
    finalTags: arr(p.finalTags).length > 0 ? arr(p.finalTags) : input.tags,
    modelUsed: model,
  }
}

/**
 * Non-AI duplicate gate for fallback path (no DeepSeek key / API failure).
 * Compares title (+ body) against `recentTitles` using the same similarity
 * engine as the pipeline's final-gate stub lookup.
 */
export function findFallbackTitleDuplicate(
  input: Pick<ChiefEditorInput, 'title' | 'summary' | 'description' | 'recentTitles'>,
): { matchedTitle: string; similarity: number } | null {
  const recent = input.recentTitles
  if (!recent?.length) return null

  const body = input.description || input.summary || ''
  let best: { matchedTitle: string; similarity: number } | null = null

  for (const candidate of recent) {
    const matchedTitle = candidate?.trim()
    if (!matchedTitle) continue
    const similarity = computeArticleSimilarity(input.title, body, matchedTitle, '')
    if (similarity >= SIMILARITY_THRESHOLD && (!best || similarity > best.similarity)) {
      best = { matchedTitle, similarity }
    }
  }

  return best
}

export function chiefEditorFallback(input: ChiefEditorInput): ChiefEditorResult {
  const duplicateHit = findFallbackTitleDuplicate(input)
  if (duplicateHit) {
    return {
      decision: 'reject',
      isDuplicate: true,
      categoryId: TEKRARLAYAN_CATEGORY_ID,
      categoryConfidence: input.categoryConfidence,
      categoryReason:
        `fallback titleSimilarity:${duplicateHit.similarity.toFixed(2)} — ` +
        duplicateHit.matchedTitle.slice(0, 80),
      overallScore: 0,
      contentQuality: 0,
      issues: ['chief_editor_fallback', 'duplicate_title_match'],
      finalTitle: input.title,
      finalSummary: input.summary,
      finalTags: input.tags,
      modelUsed: 'fallback',
    }
  }

  const score = Math.round(
    ((input.factCheckScore ?? 60) + input.categoryConfidence) / 2,
  )
  const canPublish =
    CHIEF_EDITOR_AUTO_PUBLISH &&
    score >= CHIEF_EDITOR_CONFIDENCE_THRESHOLD &&
    (input.wordCount ?? 0) >= 200

  return {
    decision: canPublish ? 'publish' : 'hold',
    isDuplicate: false,
    categoryId: input.categoryId,
    categoryConfidence: input.categoryConfidence,
    categoryReason: 'fallback — API yanıt alınamadı',
    overallScore: score,
    contentQuality: score,
    issues: ['chief_editor_fallback'],
    finalTitle: input.title,
    finalSummary: input.summary,
    finalTags: input.tags,
    modelUsed: 'fallback',
  }
}

/**
 * Resolve whether chief editor result allows auto-publish.
 */
export function chiefEditorAllowsPublish(result: ChiefEditorResult): boolean {
  if (!CHIEF_EDITOR_AUTO_PUBLISH) return false
  if (result.isDuplicate || result.decision === 'reject') return false
  if (result.decision === 'hold') return false
  return (
    result.categoryConfidence >= CHIEF_EDITOR_CONFIDENCE_THRESHOLD &&
    result.overallScore >= CHIEF_EDITOR_CONFIDENCE_THRESHOLD
  )
}

export async function runChiefEditor(input: ChiefEditorInput): Promise<ChiefEditorResult> {
  if (!getDeepSeekApiKey()) {
    return chiefEditorFallback(input)
  }

  const model = getDeepSeekModel()
  const wordCount =
    input.wordCount ??
    (input.description || '').trim().split(/\s+/).filter(Boolean).length

  const recentBlock =
    input.recentTitles && input.recentTitles.length > 0
      ? `\nRECENT_TITLES (son 48 saat — duplikasyon kontrolü):\n${input.recentTitles.slice(0, 30).map((t) => `- ${t}`).join('\n')}`
      : ''

  const userMessage = `Haberi incele ve nihai karar ver.

KELİME SAYISI: ${wordCount}${wordCount < 200 ? ' ⚠️ DÜŞÜK' : ' ✓'}
FACT-CHECK SKORU: ${input.factCheckScore ?? '—'}/100
MEVCUT KATEGORİ: ${input.categoryId} (güven: ${input.categoryConfidence})
KAYNAK: ${input.sourceLabel ?? '—'}
---
BAŞLIK: ${input.title}
SPOT: ${input.spot ?? '—'}
ÖZET: ${input.summary}
İÇERİK (ilk 3500 karakter):
${(input.description || '').slice(0, 3500)}

ETİKETLER: ${input.tags.join(', ') || '—'}
KONUM: ${[input.city, input.district, input.country].filter(Boolean).join(', ') || 'belirtilmemiş'}
ORİJİNAL BAŞLIK: ${input.originalTitle ?? '—'}${recentBlock}

1. Kategoriyi tabloya göre doğrula (Süper Lig → futbol)
2. Duplikasyon var mı kontrol et
3. JSON formatında nihai karar ver`

  try {
    const raw = await deepseekChatCompletion({
      model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.12,
      maxTokens: 1800,
      timeoutMs: 90_000,
      disableThinking: true,
      jsonMode: true,
    })

    if (!raw?.trim()) {
      console.warn('[newsroom/chiefEditor] empty DeepSeek response')
      return chiefEditorFallback(input)
    }

    return parseResult(raw, input, model)
  } catch (err) {
    console.warn(
      '[newsroom/chiefEditor] DeepSeek error:',
      err instanceof Error ? err.message : err,
    )
    return chiefEditorFallback(input)
  }
}
