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

const CATEGORY_CLASSIFICATION_RULES = `KATEGORİ SINIFLANDIRMA KURALLARI (category, categoryConfidence 0-100, isBreaking):

Her haber YALNIZCA aşağıdaki kategorilerden BİRİNE girmeli. En spesifik kategoriyi seç. Emin değilsen gundem kullan.

- teknoloji: Apple, iPhone, Android, iOS, uygulama, yapay zeka, AI, yapay zekâ, chatgpt, robot, drone, güncelleme, yazılım, donanım, bilgisayar, internet, siber, Google, Microsoft, Meta, Tesla, sosyal medya, Twitter/X, Instagram, TikTok, YouTube, oyun, gaming, elektrikli araç, uzay, roket, uydu, NASA, SpaceX. KURAL: Teknoloji şirketleri/ürünleri/güncellemeleri → her zaman teknoloji.

- siyaset: seçim, AKP, CHP, MHP, HDP, DEM, meclis, TBMM, cumhurbaşkanı, başbakan, parti, muhalefet, hükümet, bakan, milletvekili, belediye başkanı, vali, soruşturma (siyasi kişi hakkında), gözaltı (siyasetçi), ittifak, koalisyon, referandum, anayasa, siyasi kriz. KURAL: Siyasetçi hakkında haber → siyaset. Belediye/devlet kurumları haberleri → siyaset veya gundem.

- ekonomi: borsa, döviz, euro, dolar, TL, faiz, enflasyon, TCMB, merkez bankası, bütçe, ihracat, ithalat, işsizlik, piyasa, kripto, bitcoin, hisse senedi, şirket kârı/zararı, vergi, GSYİH, büyüme oranı, işletme, yatırım, ticaret. KURAL: Finansal/ekonomik göstergeler ve işletme haberleri → ekonomi.

- spor: maç, gol, lig, transfer, FIFA, UEFA, milli takım, derbi, sporcu, şampiyonluk, futbol, basketbol, tenis, voleybol, F1, olimpiyat, NTV Spor, TFF. ASLA kultur veya son-dakika olarak işaretleme (istisna: milli takım Dünya Kupası finali).

- saglik: sağlık, hastalık, ilaç, aşı, hastane, doktor, kanser, ameliyat, pandemi, salgın, beslenme, diyet, obezite, sağlık bakanlığı, WHO, tedavi, tıp.

- dunya: yurt dışı, dünya gündemi, ABD, AB, Avrupa, Rusya, Çin, Ortadoğu, savaş (Türkiye dışı), uluslararası kriz, NATO, BM, G20.

- kultur: sinema, film, tiyatro, sergi, müzik albümü, edebiyat, kitap, opera, bale, sanat, müze, galeri, ödül töreni, kültür-sanat. ASLA spor.

- magazin: ünlü, manken, oyuncu hayatı, dizi yayın tarihi, fragman, evlilik, ayrılık, dedikodu, paparazzi. isBreaking=false.

- gundem: yukarıdaki kategorilere girmeyen Türkiye iç gündemi, kamusal olaylar, trafik kazası (çok ölümlü), genel haberler.

- yerel-haber: yalnızca belirli bir il/ilçeyi kapsayan yerel olay.

- son-dakika: YALNIZCA deprem, büyük afet, darbe girişimi, suikast, tüm Türkiye'yi etkileyen acil durum. ASLA spor/magazin/teknoloji/ekonomi.

isBreaking: son-dakika ile aynı kriter; spor/magazin/kultur/teknoloji için her zaman false.
categoryConfidence: kesin eşleşme 88+, iyi eşleşme 75-87, belirsiz 55-74.`

const EDITORIAL_RULES = `- ÇIKTI DİLİ: Her zaman ve yalnızca TÜRKÇE yaz. Kaynak İngilizce, Arapça veya başka bir dilde olsa bile title, summary ve content TÜRKÇE olacak.
- Profesyonel gazete dili kullan; kaynak metindeki SEO/tıklama tuzağı kalıplarını ASLA kopyalama.
- Yasak ifadeler: "merak edildi", "merak ediliyor", "İşte ayrıntılar", "Peki,", "araştırılıyor", "izleme linki", "tıklayın", "haberin devamı", "flaş", "son dakika" (başlıkta).
- Aynı soruyu veya cümleyi tekrarlama; her paragraf yeni bilgi eklemeli.
- Başlıkta BÜYÜK HARF spam, "İZLE", kanal adı veya "| …" pipe ayraçları kullanma.
- title, summary ve content birbirinden FARKLI olmalı — summary asla title'ın aynısını veya kopyasını yazma.
- Paragraflar arasında \\n\\n kullan; cümle ortasında satır kırma yapma (ör. "32. bölüm" tek satırda).
- Dizi/TV haberlerinde: fragman, yayın tarihi, kanal gibi doğrulanabilir bilgileri aktar; spekülasyon ve soru bombardımanı yok.`

const HEADLINE_RULES = `- title (manşet/aiHeadline): gazete manşeti gibi vurucu, duygusal kanca, en fazla 65 karakter, cümle biçimi (yalnızca ilk harf büyük). Okuyucuyu durduran ama yanıltmayan.
- spot (haber girişi/lider paragraf): Gazetecilik formatı. Kim, ne, nerede, ne zaman, neden, nasıl sorularını yanıtlar. 2-4 cümle, 60-120 kelime. Makale sayfasında öne çıkan kutuda gösterilir. title'dan FARKLI, daha derin bağlam içerir.
- summary (feed teaser): title VE spot'tan TAMAMEN farklı tek cümle, en fazla 120 karakter, merak uyandıran detay. title veya spot'u kopyalama.
- seoTitle: Google arama başlığı, 55-65 karakter, anahtar kelimeler öne. title'dan farklı olabilir, daha açıklayıcı.
- seoDescription: SERP meta açıklaması, 145-160 karakter, değer önerisi + anahtar kelime + okuyucuyu tıklatacak kanca. summary'den farklı yaz.
- content (makale gövdesi): 3–6 paragraf (200–500 kelime); spot'ı tekrarlama, bağlam + olgular + arka plan yaz. Hiçbir zaman RSS özeti kopyalanmaz.`

function buildSystemPrompt(mode: 'feed' | 'archive' = 'feed'): string {
  const categories = Object.entries(AI_NEWS_CATEGORIES)
    .map(([id, name]) => `${id} (${name})`)
    .join(', ')

  if (mode === 'archive') {
    return `Sen NaHaber adlı Türkçe haber platformunun arşiv editörüsün.
Görevin: verilen kaynak haberi özgün bir dille kısa özetlemek (arşiv kaydı, canlı feed değil).
${EDITORIAL_RULES}
${HEADLINE_RULES}
- content: 2–4 paragraf (80–200 kelime); giriş + bağlam + olgular.
- Magazin/dizi haberlerinde de aynı gazete standardını koru.
${CATEGORY_CLASSIFICATION_RULES}
- Kategori seç: ${categories}
- Türkiye'deki il geçiyorsa city, ilçe geçiyorsa district (yoksa null).
- country: varsayılan "Türkiye".
- tags: 2–4 küçük harf anahtar kelime.
- Yanıtı YALNIZCA geçerli JSON:
{"title":"...","spot":"...2-4 cümle lider paragraf...","seoTitle":"...","seoDescription":"...","summary":"...","content":"...","category":"gundem","categoryConfidence":85,"isBreaking":false,"city":null,"district":null,"country":"Türkiye","tags":["..."]}`
  }

  return `Sen NaHaber adlı Türkçe haber platformunun baş editörüsün.
Görevin: verilen kaynak haberi TAMAMEN özgün, profesyonel gazete diliyle yeniden yazmak.
ASLA kaynak metni cümle cümle kopyalama. Kaynak İngilizce veya başka bir dilde olsa dahi MUTLAKA Türkçe yaz — çeviri + yeniden yazma yap.
Her zaman özgün, akıcı Türkçe yaz.
${EDITORIAL_RULES}
${HEADLINE_RULES}
- Magazin, spor, dizi/TV haberlerinde tıklama tuzağı yerine olgusal özet yaz.
${CATEGORY_CLASSIFICATION_RULES}
- Kategori seç: ${categories}
- Türkiye'deki il geçiyorsa city, ilçe geçiyorsa district alanına yaz (yoksa null).
- country: varsayılan "Türkiye"; yurt dışı haberlerde ülke adı.
- tags: 2-5 küçük harf anahtar kelime.
- Yanıtı YALNIZCA geçerli JSON olarak ver:
{"title":"...","spot":"...2-4 cümle lider paragraf...","seoTitle":"...","seoDescription":"...","summary":"...","content":"...","category":"gundem","categoryConfidence":85,"isBreaking":false,"city":null,"district":null,"country":"Türkiye","tags":["..."]}`
}

function buildUserPrompt(input: AiRewriteInput): string {
  const excerpt = input.originalContent.slice(0, 3500) || input.originalSummary
  return `Kaynak: ${input.sourceLabel}
Orijinal URL: ${input.sourceUrl}
Orijinal başlık: ${input.originalTitle}
Özet/içerik:
${excerpt}`
}

async function callOpenAi(input: AiRewriteInput): Promise<AiRewriteResult | AiArchiveRewriteResult> {
  const config = getActiveAiConfig()
  if (!config) {
    throw new Error('Hiçbir AI sağlayıcısı yapılandırılmamış (OPENAI_API_KEY veya DEEPSEEK_API_KEY gerekli)')
  }

  const mode = input.mode ?? 'feed'
  console.log(`[aiNewsEditor] ${config.provider} kullanılıyor (${config.model})`)

  const res = await fetch(config.baseUrl, {
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
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`OpenAI API error ${res.status}: ${errText.slice(0, 200)}`)
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
 * İngilizce (veya Türkçe olmayan) içerik tespiti.
 * Türkçeye özgü karakter yoksa ve yaygın İngilizce kelimeler varsa true döner.
 */
function isLikelyNonTurkish(text: string): boolean {
  if (/[ğüşıöç]/i.test(text)) return false   // Türkçe karakter → Türkçe
  const englishPattern = /\b(the|and|is|are|was|were|has|have|for|with|from|this|that|over|half|off|new|what|how|why|when|where|you|your|our|their|its|can|will|said|says|after|before|more|less|than|but|not|get|got|like|just|also|about|into|out|up|it)\b/i
  return englishPattern.test(text)
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
