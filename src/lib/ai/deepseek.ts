/**
 * DeepSeek V3 — Tek AI motoru (3 rol)
 *
 * Rol 1: deepseekCollect     — Haber toplama, duplicate tespiti, zenginleştirme
 * Rol 2: deepseekEditArticle — Profesyonel haber yazımı, SEO, sosyal medya (Gemini'nin yerini alır)
 * Rol 3: deepseekQaCheck     — Kategori doğrulama, kalite denetimi, yayın kararı (GPT+GYY'nin yerini alır)
 *
 * API: OpenAI-compatible (https://api.deepseek.com/v1/chat/completions)
 * Env: DEEPSEEK_API_KEY
 */

import type { DeepSeekCollectResult, GeminiEditResult } from './types'

import { getDeepSeekModel } from './deepseekClient'

const DEEPSEEK_MODEL = getDeepSeekModel()

// ── Shared types ──────────────────────────────────────────────────────────────

export interface GeminiEditInput {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  enrichedContent?: string
  forcedCategoryId?: string
}

export interface ChiefEditorInput extends GeminiEditResult {
  originalTitle?: string
  sourceLabel?: string
}

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

// ── Config ────────────────────────────────────────────────────────────────────
function getConfig(): { apiKey: string } | null {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null
  return { apiKey }
}

export function isDeepSeekConfigured(): boolean {
  return Boolean(getConfig())
}

// ── Core API call ─────────────────────────────────────────────────────────────
async function callDeepSeekOnce(
  messages: Array<{ role: string; content: string }>,
  opts: {
    temperature?: number
    max_tokens?: number
    timeoutMs?: number
    telemetry?: import('./usage/types').AiUsageTelemetryMeta
  }
): Promise<string> {
  const cfg = getConfig()
  if (!cfg) throw new Error('DEEPSEEK_API_KEY eksik')

  const { deepseekChatCompletion } = await import('./deepseekClient')
  return deepseekChatCompletion({
    messages,
    model: DEEPSEEK_MODEL,
    temperature: opts.temperature ?? 0.2,
    maxTokens: opts.max_tokens ?? 2048,
    timeoutMs: opts.timeoutMs ?? 90_000,
    disableThinking: true,
    jsonMode: true,
    telemetry: opts.telemetry,
  })
}

/**
 * İlk denemede timeout → max_tokens yarıya düşürülerek tek retry.
 * DeepSeek yük altında yavaşladığında 252 timeout/gün gibi kuyruk tıkanmasını önler.
 */
async function callDeepSeek(
  messages: Array<{ role: string; content: string }>,
  opts: {
    temperature?: number
    max_tokens?: number
    telemetry?: import('./usage/types').AiUsageTelemetryMeta
  } = {}
): Promise<string> {
  try {
    return await callDeepSeekOnce(messages, {
      ...opts,
      timeoutMs: 90_000,
      telemetry: { ...opts.telemetry, attempt: opts.telemetry?.attempt ?? 1 },
    })
  } catch (err) {
    const isTimeout = err instanceof Error &&
      (err.name === 'TimeoutError' || err.message.includes('timeout') || err.message.includes('aborted'))
    if (!isTimeout) throw err

    // Timeout: tek seferlik retry ile azaltılmış token sayısı
    const retryTokens = Math.max(1024, Math.round((opts.max_tokens ?? 2048) / 2))
    console.warn(`[deepseek] Timeout — retry with max_tokens=${retryTokens}`)
    return await callDeepSeekOnce(messages, {
      ...opts,
      max_tokens: retryTokens,
      timeoutMs: 90_000,
      telemetry: { ...opts.telemetry, attempt: 2, retryCount: 1 },
    })
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROL 1: COLLECTOR — Duplicate tespiti + zenginleştirme
// ═══════════════════════════════════════════════════════════════════════════════

const COLLECT_SYSTEM_PROMPT = `Sen NaHaber'in Haber Toplama ve Analiz Yapay Zekasısın.

GÖREVLER:
1. Ham haber kaynağını analiz et
2. Duplicate/benzer haber tespiti için skor ver (0-100)
3. İçeriği zenginleştir — ek bağlam, arka plan bilgisi ekle
4. Temel gerçekleri (key facts) çıkar
5. Duygu analizi yap (sentiment)
6. Aciliyet skoru ver (urgency 0-100)
7. Ham kaynak kalite skoru ver (quality 0-100)

KURALLAR:
- JSON formatında yanıt ver
- Türkçe düşün
- Abartma, clickbait, spekülasyon ekleme
- Gerçek bilgilerle zenginleştir
- Sadece JSON döndür`

export interface DeepSeekCollectInput {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  /** Previously seen article titles for duplicate detection */
  recentTitles?: string[]
}

export async function deepseekCollect(input: DeepSeekCollectInput): Promise<DeepSeekCollectResult> {
  const recentTitlesSection = input.recentTitles?.length
    ? `\nSON HABERLER (duplicate kontrolü için):\n${input.recentTitles.slice(0, 10).join('\n')}`
    : ''

  const userMessage = `Aşağıdaki haberi analiz et:

KAYNAK: ${input.sourceLabel}
BAŞLIK: ${input.originalTitle}
ÖZET: ${input.originalSummary}
İÇERİK: ${input.originalContent.slice(0, 2000)}${recentTitlesSection}

JSON formatında döndür:
{
  "isDuplicate": boolean (son haberlerden biriyle aynı içerik mi?),
  "duplicateScore": number (0-100, benzerlik skoru),
  "shouldMerge": boolean (birleştirilebilecek benzer haber var mı?),
  "enrichedContent": "string (orijinal içerik + ek bağlam/arka plan, Türkçe)",
  "keyFacts": ["string", ...] (3-7 temel gerçek),
  "sentiment": "positive|negative|neutral",
  "urgencyScore": number (0-100, aciliyet),
  "qualityScore": number (0-100, kaynak kalitesi)
}`

  const raw = await callDeepSeek([
    { role: 'system', content: COLLECT_SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ], { telemetry: { agentName: 'legacy_collect', operation: 'collect_analyze', promptVersion: 'legacy-collect:v1' } })

  const p = JSON.parse(raw) as Partial<DeepSeekCollectResult> & Record<string, unknown>

  return {
    isDuplicate: p.isDuplicate === true,
    duplicateScore: typeof p.duplicateScore === 'number' ? Math.min(100, Math.max(0, p.duplicateScore)) : 0,
    shouldMerge: p.shouldMerge === true,
    enrichedContent: typeof p.enrichedContent === 'string' && p.enrichedContent.trim()
      ? p.enrichedContent.trim()
      : input.originalContent,
    keyFacts: Array.isArray(p.keyFacts) ? p.keyFacts.map(String).slice(0, 7) : [],
    sentiment: (['positive', 'negative', 'neutral'] as const).includes(p.sentiment as never)
      ? (p.sentiment as DeepSeekCollectResult['sentiment'])
      : 'neutral',
    urgencyScore: typeof p.urgencyScore === 'number' ? Math.min(100, Math.max(0, p.urgencyScore)) : 50,
    qualityScore: typeof p.qualityScore === 'number' ? Math.min(100, Math.max(0, p.qualityScore)) : 60,
    processedAt: Date.now(),
    modelUsed: DEEPSEEK_MODEL,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROL 2: HABER EDİTÖRÜ — Profesyonel haber yazımı (Gemini'nin yerini alır)
// ═══════════════════════════════════════════════════════════════════════════════

const EDITOR_SYSTEM_PROMPT = `Sen NaHaber'in Yapay Zeka Genel Yayın Yönetmeni'sin. Türkiye'nin en büyük dijital haber platformu için profesyonel, SEO uyumlu, Google Discover optimizasyonlu Türkçe haberler üretiyorsun.

GÖREVLER:
1. Ham haberi profesyonel Türkçe gazete diline çevir
2. Tüm SEO alanlarını doldur
3. Sosyal medya metinlerini oluştur
4. Kategori ve etiketleri belirle
5. Kalite ve güven puanları ver

MUTLAK KURALLAR — ASLA İHLAL ETME:
- UYDURMA YASAK: Kaynak metinde OLMAYAN hiçbir bilgi, alıntı, istatistik, kişi adı, şehir adı veya olay ekleme. Kaynakta ne varsa onu yaz.
- ŞEHİR/KİŞİ UYDURMA KESİNLİKLE YASAK: Kaynak metinde geçmeyen bir şehir, ilçe veya kişi adı KESİNLİKLE yazma. Benzer bir haber daha önce farklı şehirde yaşandıysa bu bilgiyi KULLANMA.
- İçerik kısa veya yetersizse: qualityScore=25 ver ve sadece mevcut bilgileri yaz, eksik bölümleri asla uydurma. Kelime sayısı hedefini tutturmak için içerik üretme.
- TARAFSIZLIK ZORUNLU: Habere kişisel değerlendirme, yorum, kanaat veya siyasi görüş ekleme. "Açıkça görülüyor ki", "şüphe yok ki", "maalesef", "ne yazık ki", "şaşırtıcı biçimde" gibi yorum içeren ifadeler kullanma.
- GAZETE DİLİ: Haber metni 5N1K (Kim, Ne, Nerede, Ne zaman, Neden, Nasıl) çerçevesinde olgu bazlı yaz. Duygu yüklü, dramatik ya da propagandistik dil kullanma.
- KAYNAK AJANS/GAZETE ADI YASAK: İçerikte veya herhangi bir alanda "Anka Ajansı", "AA", "DHA", "İHA", "Bursa Gazetesi", "Milliyet", "Hürriyet" gibi kaynak gazete veya ajans adı ASLA yazma. Haber NaHaber editörü tarafından yazılıyormuş gibi kaleme alınmalı. Kaynak kişi veya kurum alıntısı gerektiğinde yalnızca o kişi/kurumu yaz ("Bakan X açıkladı", "Belediye duyurdu") — kaynak gazete/ajans adını değil.
- KAYNAK AKTARIMI: Söylemi olan haberler için "X açıkladı", "Y'ye göre", "Z bildirdi" gibi birincil kaynak atıfları kullan — haber ajansı adı değil, olayın aktörünü referans göster.
- ÇIKTI DİLİ: Her zaman TÜRKÇE
- Clickbait, yanlış bilgi YASAK
- Başlıkta BÜYÜK HARF spam, "FLAŞ", "SON DAKİKA" ifadeleri YASAK
- title, summary, content birbirinden FARKLI olmalı
- Paragraflar arasında \\n\\n kullan
- content/description gövdesini TÜM kategoriler ve alt kategorilerde ## H2 / ### H3 markdown bölümleriyle yaz (sayfa başlığı H1 olduğu için # H1 KULLANMA)
- H2/H3 en fazla 6 kelime; görsel caption/alt metnini başlık yapma
- MUTLAK TAMLIK: Her cümle, paragraf ve başlık eksiksiz bitsin. Kelime ortasında kesme. "ve/ile/için/olan" ile bitirme. "..." ile başlayan yarım paragraf yasak. Token sınırında yeni bölüm açma; son cümleyi nokta ile tamamla. Yarım metin varsa qualityScore ≤ 40 ver.
- Google News ve Google Discover uyumlu yaz

KATEGORİ KURALLARI — KAYNAK ADI DEĞİL, İÇERİK BELİRLER:
- Kaynağın adı ("Sabah Spor", "Milliyet Magazin" vb.) kategoriyi ASLA belirlemez
- Haberin GERÇEK konusu kategoriyi belirler
- Siyaset/meclis/seçim/bakan → MUTLAKA "siyaset"
- Yabancı ülke/savaş/uluslararası → MUTLAKA "dunya"
- Ekonomi/borsa/döviz/şirket → MUTLAKA "ekonomi"
- Yemek/restoran/tarif/şef/mutfak → MUTLAKA "gastronomi" (kultur veya gundem değil)
- Araba/TOGG/otomobil/trafik → MUTLAKA "otomobil"
- Magazin = YALNIZCA ünlülerin kişisel hayatı, ilişkisi, skandalı
- Futbol maçı/gol/transfer → "futbol" ("spor" değil)

KATEGORİ LİSTESİ (en spesifik olanı seç):
- son-dakika: YALNIZCA deprem, büyük afet, darbe girişimi, suikast
- siyaset: seçim, meclis, parti, cumhurbaşkanı, bakan
- ekonomi: borsa, döviz, faiz, enflasyon, şirket
- teknoloji: Apple, iOS, Android, yapay zeka, yazılım, donanım, bilgisayar
- saglik: hastalık, ilaç, aşı, hastane, tıp
- dunya: yurt dışı olaylar, uluslararası haberler
- magazin: ünlüler, dedikodu — isBreaking=false
- gundem: diğer Türkiye haberleri
- yerel-haber: tek bir il/ilçe haberi
- gastronomi: yemek, restoran, mutfak, tarif, şef
- otomobil: araç, araba, motosiklet, trafik, elektrikli araç
- SPOR alt kategoriler (maç/lig/sporcu haberleri için — isBreaking=false):
  · futbol: futbol, lig, gol, maç, transfer (futbol)
  · basketbol: basketbol, NBA, EuroLeague
  · voleybol: voleybol
  · hentbol: hentbol
  · atletizm: koşu, atletizm, olimpiyat
  · gures: güreş, wrestling
  · spor: diğer spor haberleri (genel)
- KÜLTÜR alt kategoriler:
  · sinema: film, sinema, vizyona giren, oyuncu, yönetmen
  · tiyatro: tiyatro, sahne, oyun, piyes
  · konser: konser, müzik, festival, turnesi
  · festival: kültür festivali, sanat festivali
  · kultur: genel kültür-sanat haberleri

ÇIKTI: Yalnızca geçerli JSON döndür, başka hiçbir şey ekleme.`

function buildEditorPrompt(params: GeminiEditInput): string {
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
  "description": "string (tam haber, 400-800 kelime; ## H2 / ### H3 bölümleri; paragraflar \\n\\n; # H1 yok)",
  "summary": "string (haber özeti, 120-160 karakter)",
  "spot": "string (gazetecilik lideri, Kim/Ne/Nerede/Ne zaman/Neden/Nasıl, 60-120 kelime)",
  "content": "string (tam haber, 400-1000 kelime; ## / ### markdown; paragraflar \\n\\n; tüm kategori/alt kategorilerde aynı yapı)",
  "category": "string (son-dakika|gundem|siyaset|ekonomi|finans-piyasa|emlak-konut|enerji|is-kariyer|spor|futbol|basketbol|voleybol|hentbol|atletizm|gures|teknoloji|oyun-espor|saglik|egitim|cevre-iklim|din-inanc|dunya|kibris-haberleri|kultur|sinema|tiyatro|konser|festival|magazin|bilim|yasam|moda|anne-cocuk|dekorasyon|iliskiler|tarih|yerel-haber|gastronomi|otomobil|trend)",
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

function parseEditorJson(raw: string, fallbackModel: string): GeminiEditResult {
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
    modelUsed: fallbackModel,
  }
}

export async function deepseekEditArticle(input: GeminiEditInput): Promise<GeminiEditResult> {
  const prompt = buildEditorPrompt(input)
  const raw = await callDeepSeek(
    [
      { role: 'system', content: EDITOR_SYSTEM_PROMPT },
      { role: 'user', content: prompt },
    ],
    {
      temperature: 0.3,
      max_tokens: 6000,
      telemetry: { agentName: 'legacy_edit', operation: 'edit_article', promptVersion: 'legacy-edit:v1' },
    }
  )
  return parseEditorJson(raw, DEEPSEEK_MODEL)
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROL 3: GYY / KALİTE DENETİMİ — Kategori doğrulama + yayın kararı
//         (GPT + Gemini chiefEditor'ın yerini alır)
// ═══════════════════════════════════════════════════════════════════════════════

const QA_SYSTEM_PROMPT = `Sen NaHaber'in Genel Yayın Yönetmeni'sin. DeepSeek editörünün hazırladığı haberi bağımsız olarak inceleyip nihai yayın kararını veriyorsun.

## TEMEL GÖREVLER
1. Kategoriyi doğrula, yanlışsa düzelt
2. İçerik kalitesini değerlendir
3. Başlık/açıklama sorunlarını düzelt
4. Nihai kararı ver

## YAYIM KURALLARI
- approved      : Güvenilir kaynak, yeterli içerik (≥200 kelime), doğrulanabilir bilgi, doğru kategori
- needs_revision: Kategori yanlış, başlık sorunlu, içerik kısa ama gerçek (120-199 kelime)
- rejected      : İçerik <120 kelime; tamamen doğrulanamaz iddia; clickbait/spam

## MUTLAK YASAK
- Kaynakta OLMAYAN bilgi, kişi adı, şehir adı, rakam veya alıntı ekleme
- Spekülatif veya uydurma içerik üretme
- Haberin şehri belirsizse şehir bilgisi EKLEME — belirsiz bırak veya REJECTED ver
- Habere yorum, kanaat, değerlendirme veya duygu yüklü ifade ekleme ("maalesef", "şaşırtıcı" vb. yasak)
- Dramatik, propagandistik veya partizan dil kullanma
- Yarım cümle, kesilmiş kelime, bağlaçla biten paragraf veya görsel caption'ının H2/H3 olarak kopyası → needs_revision

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

**ÖRNEK 2** — Yemek "kultur"a gitmiş:
Başlık: "Türk mutfağının incisi: Mantı nasıl yapılır?"
→ KATEGORİ: gastronomi ✓ (tarif içeriği — kultur değil)

**ÖRNEK 3** — Film vs özel hayat:
Başlık: "Kerem Bürsin'in yeni filmi Cannes'da ödül aldı"
→ KATEGORİ: sinema ✓ (film haberi — magazin değil)

**ÖRNEK 4** — Aynı ünlü, farklı içerik:
Başlık: "Kerem Bürsin ve Hande Erçel barıştı"
→ KATEGORİ: magazin ✓ (özel hayat haberi)

**ÖRNEK 5** — Tesla hissesi:
Başlık: "Tesla hisseleri %10 düştü"
→ KATEGORİ: ekonomi ✓ (borsa/hisse — teknoloji değil)

**ÖRNEK 6** — Trafik vs otomobil:
Başlık: "İzmir'de zincirleme kaza: 3 yaralı"
→ KATEGORİ: yerel-haber ✓ (tek şehir kazası — otomobil değil)

**ÖRNEK 7** — TOGG:
Başlık: "TOGG T10X ikinci seri üretimde"
→ KATEGORİ: otomobil ✓ (araç haberi — teknoloji değil)

**ÖRNEK 8** — "yarış" kelimesi tuzağı:
Başlık: "Ortadoğu'da nükleer yarış: Kim silaha ne kadar yakın?"
→ KATEGORİ: dunya ✓ (uluslararası güvenlik — "yarış" burada silahlanma yarışı, spor DEĞİL)

**ÖRNEK 9** — "yarış" gerçek spor:
Başlık: "F1 Monako yarışını Verstappen kazandı"
→ KATEGORİ: spor ✓ (gerçek araç yarışı)

**ÖRNEK 10** — Zodiac kelimesi tuzağı (finansal):
Başlık: "Boğa piyasası sinyalleri güçleniyor: BİST 100 rekor kırdı"
İçerik: borsa, hisse, yatırım, BİST, piyasa analizi...
→ KATEGORİ: borsa ✓ ("boğa" burada bull market, burç DEĞİL — içeriğe bak)

**ÖRNEK 11** — Zodiac kelimesi tuzağı (spor):
Başlık: "Aslan takımı ligde zirveye yerleşti"
İçerik: futbol maçı, gol, puan tablosu...
→ KATEGORİ: futbol ✓ ("aslan" takma adı, burç DEĞİL — içeriğe bak)

⚠️ GENEL KURAL: Tek bir kelimeyle değil, HABERİN TAMAMI ile karar ver.
"boğa", "aslan", "yay", "terazi", "akrep" gibi kelimeler astroloji sinyali DEĞİLDİR;
"burç", "astroloji", "yükselen burç", "günlük burç" gibi açık ifadeler gereklidir.

## ÇIKTI FORMAT (yalnızca JSON):
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

export async function deepseekQaCheck(article: ChiefEditorInput): Promise<ChiefEditorResult> {
  const wordCount = (article.content || article.description || '')
    .trim().split(/\s+/).filter(Boolean).length

  const prompt = `Aşağıdaki haberi incele ve yayın kararı ver.

KELIME SAYISI: ${wordCount} ${wordCount < 200 ? '⚠️ DÜŞÜK (hedef ≥200, asgari yayın ~220)' : '✓'}
KALİTE SKORU: ${article.qualityScore}/100
MEVCUT KATEGORİ: ${article.category}
---
BAŞLIK: ${article.title}
ÖZET: ${article.summary}
İÇERİK:
${(article.content || article.description || '').slice(0, 3000)}

ETİKETLER: ${(article.tags ?? []).join(', ')}
KONUM: ${article.location || 'belirtilmemiş'}
---

1. Kategoriyi tablodaki kurallara göre doğrula
2. JSON formatında nihai karar ver`

  try {
    const raw = await callDeepSeek(
      [
        { role: 'system', content: QA_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      {
        temperature: 0.15,
        max_tokens: 1500,
        telemetry: { agentName: 'legacy_qa', operation: 'qa_check', promptVersion: 'legacy-qa:v1' },
      }
    )

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
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
      webSearchUsed: false,    // DeepSeek web araması desteklemiyor
      searchQueries: [],
      searchSources: [],
      categoryReason: str(p.categoryReason),
      issues: arr(p.issues),
      pushTitle: str(p.pushTitle, article.pushTitle).slice(0, 60),
      pushBody: str(p.pushBody, article.pushBody).slice(0, 120),
      processedAt: Date.now(),
      modelUsed: DEEPSEEK_MODEL,
    }
  } catch (err) {
    console.warn('[deepseek/qa] Hata, fallback:', err instanceof Error ? err.message : err)
    return deepseekQaFallback(article)
  }
}

export function deepseekQaFallback(article: GeminiEditResult): ChiefEditorResult {
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
    categoryReason: 'fallback — QA yanıt alınamadı',
    issues: [],
    pushTitle: article.pushTitle,
    pushBody: article.pushBody,
    processedAt: Date.now(),
    modelUsed: `${DEEPSEEK_MODEL}-fallback`,
  }
}

// ── Health check ──────────────────────────────────────────────────────────────
export async function checkDeepSeekHealth(): Promise<{
  ok: boolean
  latencyMs: number
  model: string
  roles: string[]
  error?: string
}> {
  const start = Date.now()
  try {
    const cfg = getConfig()
    if (!cfg) return { ok: false, latencyMs: 0, model: DEEPSEEK_MODEL, roles: [], error: 'DEEPSEEK_API_KEY eksik' }

    const { deepseekChatCompletion } = await import('./deepseekClient')
    await deepseekChatCompletion({
      model: DEEPSEEK_MODEL,
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 8,
      timeoutMs: 8_000,
      disableThinking: true,
      jsonMode: false,
      telemetry: {
        agentName: 'health_check',
        operation: 'health_ping',
        promptVersion: 'health-check:v1',
      },
    })
    return {
      ok: true,
      latencyMs: Date.now() - start,
      model: DEEPSEEK_MODEL,
      roles: ['collector', 'editor', 'qa'],
    }
  } catch (err) {
    return { ok: false, latencyMs: Date.now() - start, model: DEEPSEEK_MODEL, roles: [], error: String(err) }
  }
}
