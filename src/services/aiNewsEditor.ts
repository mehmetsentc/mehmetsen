import { DEFAULT_CATEGORIES } from '@/constants/config'
import {
  buildFeedTeaser,
  cleanupNewsBody,
  cleanupNewsSummary,
  cleanupNewsTitle,
  MAX_FEED_TEASER_LENGTH,
} from '@/lib/newsContentCleanup'
import { slugifyCity } from '@/lib/location'

/** AI-assigned news categories (slug → display name). */
export const AI_NEWS_CATEGORIES: Record<string, string> = {
  'son-dakika': 'Son Dakika',
  'yerel-haber': 'Yerel Haber',
  gundem: 'Gündem',
  siyaset: 'Siyaset',
  ekonomi: 'Ekonomi',
  spor: 'Spor',
  dunya: 'Dünya',
  teknoloji: 'Teknoloji',
  saglik: 'Sağlık',
  kultur: 'Kültür',
  magazin: 'Magazin',
  bilim: 'Bilim',
  trend: 'Trend',
  influencer: 'Influencer',
}

/** Spec / English aliases → canonical Turkish slug ids. */
const CATEGORY_ALIASES: Record<string, string> = {
  'breaking-news': 'son-dakika',
  breaking: 'son-dakika',
  politics: 'siyaset',
  economy: 'ekonomi',
  sports: 'spor',
  world: 'dunya',
  technology: 'teknoloji',
  tech: 'teknoloji',
  health: 'saglik',
  culture: 'kultur',
  'kultur-sanat': 'kultur',
  science: 'bilim',
  general: 'gundem',
  local: 'yerel-haber',
  'local-news': 'yerel-haber',
  yerel: 'yerel-haber',
  'yerel-haber': 'yerel-haber',
  magazin: 'magazin',
  dedikodu: 'magazin',
  entertainment: 'magazin',
}

const CATEGORY_IDS = new Set([
  ...Object.keys(AI_NEWS_CATEGORIES),
  ...DEFAULT_CATEGORIES.map((c) => c.id),
])

export interface AiRewriteInput {
  sourceLabel: string
  originalTitle: string
  originalSummary: string
  originalContent: string
  sourceUrl: string
  /** Lighter rewrite for historical archive backfill. */
  mode?: 'feed' | 'archive'
  /** Son 48 saatte yayınlanan başlıklar — duplikasyon tespiti için */
  recentTitles?: string[]
}

export interface AiRewriteResult {
  title: string
  /**
   * SPOT — gazetecilik lideri / haber girişi.
   * Kim / Ne / Nerede / Ne zaman / Neden / Nasıl cevaplar.
   * 2-4 cümle, 60-120 kelime. Makale sayfasında öne çıkan bölüm.
   */
  spot: string
  /** Short feed teaser — distinct from title, max 120 chars. */
  summary: string
  description: string
  /** SEO-optimized title for <title> tag and SERP (55-65 chars). */
  seoTitle: string
  /** SEO meta description for SERP snippet (145-160 chars). */
  seoDescription: string
  categoryId: string
  /** 0–100 — AI confidence in category assignment. */
  categoryConfidence: number
  /** True only for nationwide urgent events (see classification rules). */
  isBreaking: boolean
  city: string | null
  district: string | null
  country: string
  tags: string[]
}

interface OpenAiJsonPayload {
  title?: string
  spot?: string
  summary?: string
  description?: string
  content?: string
  seoTitle?: string
  seoDescription?: string
  category?: string
  categoryConfidence?: number
  isBreaking?: boolean
  isDuplicate?: boolean
  city?: string | null
  district?: string | null
  country?: string | null
  tags?: string[]
}

export interface AiArchiveRewriteResult extends AiRewriteResult {
  summary: string
}

interface AiProviderConfig {
  apiKey: string
  model: string
  baseUrl: string
  provider: 'openai' | 'deepseek'
}

function getOpenAiConfig(): AiProviderConfig | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  return {
    apiKey,
    model: process.env.OPENAI_NEWS_MODEL?.trim() || 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1/chat/completions',
    provider: 'openai',
  }
}

function getDeepSeekConfig(): AiProviderConfig | null {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null
  return {
    apiKey,
    model: process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1/chat/completions',
    provider: 'deepseek',
  }
}

/** OpenAI önce, DeepSeek fallback — hangisi yapılandırılmışsa onu kullan */
function getActiveAiConfig(): AiProviderConfig | null {
  return getOpenAiConfig() ?? getDeepSeekConfig()
}

function normalizeCategoryId(raw?: string): string {
  const value = raw?.trim().toLowerCase() ?? ''
  const slug = value
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')

  if (CATEGORY_ALIASES[slug]) return CATEGORY_ALIASES[slug]
  if (CATEGORY_IDS.has(slug)) return slug

  const byName = Object.entries(AI_NEWS_CATEGORIES).find(
    ([, name]) => name.toLowerCase() === value || name.toLowerCase() === raw?.trim().toLowerCase()
  )
  if (byName) return byName[0]

  return 'gundem'
}

function appendSourceAttribution(body: string, sourceLabel: string): string {
  const trimmed = body.trim()
  const marker = `Kaynak: ${sourceLabel}`
  if (trimmed.toLowerCase().includes('kaynak:')) return trimmed
  return `${trimmed}\n\n${marker}`
}

// ── Sabit prompt blokları ────────────────────────────────────────────────────

const TIMEZONE_RULES = `SAATLERİ TÜRK SAATİNE ÇEVİR (UTC+3):
- İçerikte geçen TÜM saat ve tarih ifadelerini Türkiye saatine (UTC+3) çevir.
- Orijinal kaynak hangi saat diliminde olursa olsun (ET, GMT, CET, UTC vb.) Türkiye saati ile yaz.
- Format: "21:00 TSİ" veya "Türkiye saatiyle 21:00'da"
- Örnekler: "3pm ET" → "23:00 TSİ" | "19:00 CET" → "21:00 TSİ" | "12:00 UTC" → "15:00 TSİ"
- Futbol maçları, F1, basketbol, tenis, Dünya Kupası gibi tüm spor etkinlik saatlerinde bu kuralı MUTLAKA uygula.
- Eğer saat dilimi belirsizse "yerel saatle" diye belirt, uydurma.`

const DUPLICATE_RULES = `TEKRAR YAYINLAMA ENGELİ:
- Sana aşağıda son 48 saatte yayınlanan başlıklar verilecek (RECENT_TITLES bölümünde).
- Bu haberle aynı olayı/konuyu anlatan başlık listede varsa → isDuplicate: true döndür.
- "Aynı olay" kriterleri: aynı spor maç skoru, aynı siyasi karar, aynı kişi aynı eylem, aynı şirket aynı ürün lansmanı.
- Farklı açıdan ele alınmış (ek bilgi, gelişme, röportaj) → isDuplicate: false.
- isDuplicate: true olduğunda diğer alanları kısaca doldur, yayınlanmayacak.`

const WRITING_STYLE_RULES = `HABER YAZIM TARZI — TÜRK GAZETECİLİK STANDARDI:
YAPI (Ters Piramit):
  1. Spot/giriş: En önemli bilgi ilk cümlede. Kim, ne, nerede, ne zaman.
  2. Gelişme: Arka plan, bağlam, nedenler.
  3. Detaylar: İkincil bilgiler, alıntılar, istatistikler.
  4. Bağlam: Tarihsel arka plan, karşılaştırmalar.

DİL:
  - Etken çatı tercih et: "Beşiktaş gol attı" → doğru | "Gol atıldı" → yanlış
  - Kısa cümleler (15-20 kelime ideal). Uzun cümleleri ikiye böl.
  - Belirsiz ifadeler yasak: "iddia edildiğine göre", "bazı çevreler"
  - Rakamları yaz: "3" değil "üç" (10'dan küçük), "15" olduğu gibi (10+)
  - Alıntı varsa tırnak içinde ver: Erdoğan, "Türkiye bu kararın yanında" dedi.

YASAKLI İFADELER (HİÇBİR KOŞULDA KULLANMA):
  merak edildi, merak ediliyor, işte o an, peki ne oldu, araştırılıyor,
  flaş haber, son dakika (başlıkta), tıklayın, izleyin, haberin devamı,
  dikkat çeken, dikkat çekti, viral oldu, sosyal medya yıkıldı,
  İşte ayrıntılar, Peki,, gündem oldu (sebep belirtmeden)

SPOR HABERLERI ÖZEL KURALLAR:
  - Maç sonuçlarında kesin skor yaz: "Galatasaray 2-1 Fenerbahçe'yi yendi"
  - Transfer haberlerinde rakam varsa yaz: "45 milyon euro bonservis"
  - Maç saatini MUTLAKA Türkiye saati (TSİ) ile belirt
  - Lig sıralaması değişmişse belirt: "Süper Lig'de liderliğe yükseldi"`

const CATEGORY_CLASSIFICATION_RULES = `KATEGORİ SINIFLANDIRMA KURALLARI:

Her haber YALNIZCA aşağıdaki kategorilerden BİRİNE girmeli. En spesifik kategoriyi seç.

- teknoloji: Apple/Google/Microsoft/Meta/Tesla ürün veya hizmeti, yapay zeka, ChatGPT, yazılım güncelleme, siber saldırı, oyun konsolu, elektrikli araç teknolojisi, uzay/roket, drone, robot, sosyal medya platform değişikliği. KURAL: Ürün/servis → teknoloji. Şirketin ekonomik haberi → ekonomi.

- siyaset: Cumhurbaşkanı/Başbakan/Bakan kararı veya açıklaması, seçim/sandık/oy, AKP/CHP/MHP/HDP/DEM parti haberleri, meclis/TBMM oturumu, koalisyon/referandum, siyasetçi yargılanması. KURAL: Afet sonrası "hükümet yardım gönderdi" → gundem (siyaset değil). Gerçek siyasi karar/tartışma → siyaset.

- ekonomi: Borsa/döviz/faiz/enflasyon rakamları, TCMB kararı, şirket bilançosu/halka arz, ihracat/ithalat istatistik, işsizlik oranı, kripto piyasa, vergi düzenlemesi, asgari ücret.

- spor: Futbol/basketbol/tenis/voleybol/F1/olimpiyat/güreş — maç sonucu, transfer, sakatlık, teknik direktör değişikliği, turnuva haberi. ASLA son-dakika kategorisi (istisna: Dünya Kupası finali milli zafer).

- saglik: Hastalık/ilaç/aşı/tedavi/ameliyat, pandemi/salgın uyarısı, beslenme/diyet araştırması, WHO/sağlık bakanlığı açıklaması.

- dunya: Türkiye dışı coğrafyada gelişen olay — ABD/AB/Rusya/Çin/Ortadoğu haberleri, uluslararası savaş/kriz, NATO/BM/G20 kararları, yabancı lider açıklaması.

- kultur: Sinema/film/tiyatro/opera/bale/sergi/müze, edebiyat/kitap, müzik albümü çıkışı, ödül töreni (Oscar/Nobel vb.), kültür-sanat etkinliği. ASLA spor.

- magazin: Ünlü/celebrity haberi, oyuncu/şarkıcı özel hayatı, dizi yayın tarihi/fragman, evlilik/boşanma/ayrılık, dedikodu. isBreaking=false.

- gundem: Yukarıdakilere girmeyen Türkiye iç gündemi — trafik kazası (çok ölümlü), yangın, genel kamusal olay, hükümet açıklaması (politika değil).

- yerel-haber: Yalnızca tek bir il/ilçeyi kapsayan yerel olay, belediye kararı, yerel seçim sonucu.

- son-dakika: YALNIZCA şiddetli deprem (4.5+), büyük afet (onlarca ölü), darbe girişimi, suikast, Türkiye'yi doğrudan tehdit eden acil durum. ASLA spor/magazin/teknoloji/ekonomi.

isBreaking: son-dakika kriterleriyle aynı; spor/magazin/kultur/teknoloji için her zaman false.
categoryConfidence: kesin eşleşme 88-100, iyi eşleşme 75-87, belirsiz 55-74.`

const EDITORIAL_RULES = `TEMEL EDİTÖRYEL KURALLAR:
- ÇIKTI DİLİ: Her zaman Türkçe. Kaynak İngilizce/Arapça/başka dilde olsa bile TÜRKÇE çeviri + yeniden yazma yap.
- ASLA kaynak metni kelimesi kelimesine kopyalama. Özgün Türkçe gazete dili.
- title, spot, summary, content HEPSİ birbirinden farklı bilgi sunsun — kopyalama.
- Paragraflar arası \\n\\n kullan. Cümle ortasında satır kırma yapma.`

const HEADLINE_RULES = `ALAN TANIMLARI:
- title: Gazete manşeti. Maks 65 karakter. Yalnızca ilk harf büyük. Vurucu ama yanıltmayan. Soru işareti ile bitirme.
- spot: Lider paragraf (haber girişi). Kim+ne+nerede+ne zaman+neden. 2-4 cümle, 60-120 kelime. title'dan farklı bilgi ver.
- summary: Feed teaser. Maks 120 karakter. title ve spot'tan TAMAMEN farklı ilgi çekici detay.
- seoTitle: Google arama başlığı. 55-65 karakter. Anahtar kelimeler öne.
- seoDescription: SERP açıklaması. 145-160 karakter. Değer önerisi + anahtar kelime.
- content: Makale gövdesi. 3-6 paragraf (200-500 kelime). Spot'u tekrarlama. Bağlam+olgular+arka plan.`

function buildSystemPrompt(mode: 'feed' | 'archive' = 'feed'): string {
  const categories = Object.entries(AI_NEWS_CATEGORIES)
    .map(([id, name]) => `${id} (${name})`)
    .join(', ')

  const jsonSchema = `{"title":"...","spot":"...","seoTitle":"...","seoDescription":"...","summary":"...","content":"...","category":"gundem","categoryConfidence":85,"isBreaking":false,"isDuplicate":false,"city":null,"district":null,"country":"Türkiye","tags":["..."]}`

  if (mode === 'archive') {
    return `Sen NaHaber'in arşiv editörüsün. Kaynak haberi kısaca özetle (arşiv kaydı).
${EDITORIAL_RULES}
${HEADLINE_RULES}
- content: 2-4 paragraf (80-200 kelime).
${TIMEZONE_RULES}
${CATEGORY_CLASSIFICATION_RULES}
- city: Türkiye'deki il adı (yoksa null). district: ilçe (yoksa null). country: varsayılan "Türkiye".
- tags: 2-4 küçük harf etiket.
Yanıt YALNIZCA geçerli JSON: ${jsonSchema}`
  }

  return `Sen NaHaber'in baş editörüsün. Türkiye'nin önde gelen dijital haber platformu için profesyonel haberler üretiyorsun.

${WRITING_STYLE_RULES}

${TIMEZONE_RULES}

${DUPLICATE_RULES}

${EDITORIAL_RULES}

${HEADLINE_RULES}

${CATEGORY_CLASSIFICATION_RULES}

- city: Türkiye'deki il adı (yoksa null). district: ilçe (yoksa null). country: varsayılan "Türkiye"; yurt dışı haberde ülke adı.
- tags: 2-5 küçük harf, boşluksuz etiket (ör: "galatasaray", "deprem", "yapay-zeka").
- isDuplicate: RECENT_TITLES listesindeki başlıkla %80+ aynı olaysa true, yoksa false.

Yanıt YALNIZCA geçerli JSON: ${jsonSchema}`
}

function buildUserPrompt(input: AiRewriteInput): string {
  const excerpt = input.originalContent.slice(0, 3500) || input.originalSummary
  const recentSection = input.recentTitles && input.recentTitles.length > 0
    ? `\nRECENT_TITLES (son 48 saatte yayınlananlar — duplikasyon kontrolü için):\n${input.recentTitles.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n`
    : ''
  return `Kaynak: ${input.sourceLabel}
Orijinal URL: ${input.sourceUrl}
Orijinal başlık: ${input.originalTitle}${recentSection}
Özet/içerik:
${excerpt}`
}

/** Single HTTP call to one provider. Throws on non-2xx. */
async function callSingleProvider(
  config: AiProviderConfig,
  input: AiRewriteInput,
): Promise<Response> {
  const mode = input.mode ?? 'feed'
  return fetch(config.baseUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      temperature: mode === 'archive' ? 0.45 : 0.55,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: buildSystemPrompt(mode) },
        { role: 'user', content: buildUserPrompt(input) },
      ],
    }),
    signal: AbortSignal.timeout(35_000),
  })
}

async function callOpenAi(input: AiRewriteInput): Promise<AiRewriteResult | AiArchiveRewriteResult> {
  const mode = input.mode ?? 'feed'
  const primary = getActiveAiConfig()
  if (!primary) {
    throw new Error('Hiçbir AI sağlayıcısı yapılandırılmamış (OPENAI_API_KEY veya DEEPSEEK_API_KEY gerekli)')
  }

  console.log(`[aiNewsEditor] ${primary.provider} kullanılıyor (${primary.model})`)

  let res = await callSingleProvider(primary, input)

  // 429 rate-limit → otomatik olarak diğer sağlayıcıya geç
  if (res.status === 429) {
    const fallbackConfig = primary.provider === 'openai' ? getDeepSeekConfig() : getOpenAiConfig()
    if (fallbackConfig) {
      console.warn(`[aiNewsEditor] ${primary.provider} 429, ${fallbackConfig.provider}'a geçiliyor`)
      res = await callSingleProvider(fallbackConfig, input)
    }
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`AI API error ${res.status}: ${errText.slice(0, 200)}`)
  }

  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = json.choices?.[0]?.message?.content?.trim()
  if (!content) throw new Error('OpenAI returned empty content')

  let parsed: OpenAiJsonPayload
  try {
    parsed = JSON.parse(content) as OpenAiJsonPayload
  } catch {
    throw new Error('OpenAI returned invalid JSON')
  }

  // Duplikasyon tespiti — AI aynı haberi zaten yayınlandığı için işaretlediyse atla
  if (parsed.isDuplicate === true) {
    throw new Error(`[aiNewsEditor] AI duplikat tespit etti — yayın atlandı: "${input.originalTitle.slice(0, 60)}"`)
  }

  const title = cleanupNewsTitle(parsed.title?.trim() || input.originalTitle)
  const bodyRaw = cleanupNewsBody(
    parsed.content?.trim() || parsed.description?.trim() || input.originalSummary,
    { preserveSourceLine: false }
  )
  const description = appendSourceAttribution(bodyRaw, input.sourceLabel)
  const summaryCandidate = cleanupNewsSummary(
    parsed.summary?.trim() ||
      bodyRaw.split(/[.!?]\s+/).slice(1, 2).join('. ').slice(0, MAX_FEED_TEASER_LENGTH)
  )
  const summary =
    buildFeedTeaser(title, summaryCandidate, bodyRaw) ||
    buildFeedTeaser(title, bodyRaw.split(/[.!?]\s+/).slice(0, 1).join('. '), bodyRaw)

  // Spot — journalistic lead paragraph
  const spot = cleanupNewsSummary(parsed.spot?.trim() || summary).slice(0, 600)

  // SEO fields — fallback to title/summary if AI didn't return them
  const seoTitle = (parsed.seoTitle?.trim() || title).slice(0, 70)
  const seoDescription = (parsed.seoDescription?.trim() || summary || bodyRaw.slice(0, 160)).slice(0, 165)

  const categoryId = normalizeCategoryId(parsed.category)
  const categoryConfidence = Math.min(
    100,
    Math.max(0, typeof parsed.categoryConfidence === 'number' ? parsed.categoryConfidence : 75)
  )
  const isBreaking = parsed.isBreaking === true
  const cityRaw = parsed.city?.trim()
  const city = cityRaw && cityRaw.toLowerCase() !== 'null' ? cityRaw : null
  const districtRaw = parsed.district?.trim()
  const district = districtRaw && districtRaw.toLowerCase() !== 'null' ? districtRaw : null
  const countryRaw = parsed.country?.trim()
  const country = countryRaw && countryRaw.toLowerCase() !== 'null' ? countryRaw : 'Türkiye'
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 6)
    : []

  if (city && !tags.includes(slugifyCity(city))) {
    tags.unshift(slugifyCity(city))
  }
  if (district) {
    const d = district.toLocaleLowerCase('tr-TR').replace(/\s+/g, '-')
    if (!tags.includes(d)) tags.push(d)
  }

  const base = {
    title,
    spot,
    summary,
    description,
    seoTitle,
    seoDescription,
    categoryId,
    categoryConfidence,
    isBreaking,
    city,
    district,
    country,
    tags,
  }

  if (mode === 'archive') {
    return { ...base, summary: summary || cleanupNewsSummary(bodyRaw.slice(0, MAX_FEED_TEASER_LENGTH)) }
  }

  return base
}

/** Fallback when OpenAI is unavailable — still unique-ish summary + source line. */
function fallbackRewrite(input: AiRewriteInput): AiRewriteResult | AiArchiveRewriteResult {
  const rawBase = input.originalSummary || input.originalContent
  // Cut at sentence boundary instead of mid-word
  const base = (() => {
    const limit = 800
    if (rawBase.length <= limit) return rawBase
    const cut = rawBase.slice(0, limit)
    const lastSentence = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '))
    return lastSentence > 200 ? cut.slice(0, lastSentence + 1) : cut
  })()
  const title = cleanupNewsTitle(input.originalTitle)
  const bodyRaw = `${base}`
  const description = appendSourceAttribution(
    cleanupNewsBody(bodyRaw, {
      preserveSourceLine: false,
    }),
    input.sourceLabel
  )
  const summary =
    buildFeedTeaser(title, base.slice(0, MAX_FEED_TEASER_LENGTH), description) ||
    cleanupNewsSummary(base.slice(0, MAX_FEED_TEASER_LENGTH))
  const result = {
    title,
    spot: summary.slice(0, 600),
    summary,
    description,
    seoTitle: title.slice(0, 70),
    seoDescription: (summary || base.slice(0, 160)).slice(0, 165),
    categoryId: 'gundem',
    categoryConfidence: 50,
    isBreaking: false,
    city: null,
    district: null,
    country: 'Türkiye',
    tags: [] as string[],
  }
  if (input.mode === 'archive') {
    return { ...result, summary: summary || cleanupNewsSummary(base.slice(0, MAX_FEED_TEASER_LENGTH) || input.originalTitle) }
  }
  return result
}

/**
 * Karakter-oranı tabanlı Türkçe tespiti (daha güvenilir).
 * Türkçeye özgü karakterlerin oranına bakarak dil tahmini yapar.
 * "Three red cards shown" gibi sıradan İngilizce cümleleri de yakalar.
 */
function isLikelyNonTurkish(text: string): boolean {
  if (!text || text.length < 15) return false
  // Türkçe özel karakter varsa kesinlikle Türkçe
  if (/[ğüşıöçĞÜŞİÖÇ]/.test(text)) return false
  // Metin yeterince uzunsa karakter-oran kontrolü yap
  const letters = (text.match(/\p{L}/gu) ?? []).length
  if (letters < 15) return false
  const trChars = (text.match(/[ğüşıöçĞÜŞİÖÇ]/g) ?? []).length
  // Türkçe metinlerde genellikle %0.8'den fazla Türkçe-özel karakter bulunur
  // İngilizce/Arapça/diğer → oran sıfır
  return trChars / letters < 0.008
}

export const aiNewsEditor = {
  isConfigured(): boolean {
    return Boolean(getActiveAiConfig())
  },

  async rewriteArticle(input: AiRewriteInput): Promise<AiRewriteResult | AiArchiveRewriteResult> {
    if (!getActiveAiConfig()) {
      // Hiçbir AI yokken İngilizce içerik yayınlama
      if (isLikelyNonTurkish(input.originalTitle)) {
        throw new Error(`[aiNewsEditor] İngilizce içerik, AI key eksik — yayın atlandı: "${input.originalTitle.slice(0, 60)}"`)
      }
      console.warn('[aiNewsEditor] AI key eksik — ham metin fallback')
      return fallbackRewrite(input)
    }

    try {
      return await callOpenAi(input)
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      // Duplikat tespit hatası → fallback'e düşürme, yayınlama
      if (msg.includes('AI duplikat tespit etti')) {
        console.warn(msg)
        throw error
      }
      // AI başarısız + İngilizce içerik → yayınlama
      if (isLikelyNonTurkish(input.originalTitle)) {
        console.warn(`[aiNewsEditor] AI hatası + İngilizce içerik → yayın atlandı: "${input.originalTitle.slice(0, 60)}"`)
        throw error
      }
      console.error('[aiNewsEditor] rewrite failed, fallback:', error)
      return fallbackRewrite(input)
    }
  },
}
