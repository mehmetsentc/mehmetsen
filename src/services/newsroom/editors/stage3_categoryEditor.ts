/**
 * STAGE 3 — Category Editor
 *
 * Tek sorumluluğu: Yazılmış haberi kategorilendirmek.
 * - Kategori (categoryId)
 * - Son-dakika mı? (isBreaking) — SADECE gerçek acil durumlar
 * - Şehir, ülke
 * - Etiketler
 *
 * Bu aşama Stage 1'den BAĞIMSIZ çalışır — yalnızca kategori kararı verir.
 * Dedike AI çağrısı: tek prompt, net kurallar, net çıktı.
 */

import type { WrittenArticle } from './stage1_contentWriter'

export interface CategoryResult {
  categoryId: string
  isBreaking: boolean
  confidence: number     // 0-100
  city: string | null
  district: string | null
  country: string
  tags: string[]
  reason: string         // kategorinin neden seçildiği (log için)
}

interface CategoryInput {
  title: string
  content: string
  sourceLabel: string
  forcedCategoryId?: string
}

const SYSTEM_PROMPT = `Sen NaHaber'in kategori editörüsün. Verilen haber başlığı ve içeriğini analiz ederek kategori, son-dakika durumu ve konum bilgisi belirliyorsun.

KATEGORİ KURALLARI (EN SPESİFİK KATEGORİYİ SEÇ):

SPOR alt kategorileri:
- dunya-kupasi-2026: 2026 FIFA Dünya Kupası — grup, maç, skor, puan tablosu, kadro, elenme, final, dünya kupası haberleri
- futbol: Futbol maçı, gol, transfer, teknik direktör, Süper Lig, UEFA, FIFA, TFF, derbi
- basketbol: Basketbol maçı, NBA, EuroLeague, transfer
- voleybol: Voleybol maçı, Efeler/Sultanlar Ligi
- hentbol: Hentbol haberleri
- atletizm: Koşu, maraton, olimpiyat atletizm
- gures: Güreş turnuvası
- spor: F1, tenis, boks, yüzme, golf, olimpiyat (dal belirsiz)

DİĞER KATEGORİLER:
- son-dakika: Türkiye'yi veya dünyayı doğrudan etkileyen ÖNEMLİ gelişmeler. isBreaking: true ZORUNLU.
  TÜRKİYE son-dakika kriterleri (herhangi biri):
  • Deprem 4.0+, büyük afet, toplu tahliye, onlarca ölü
  • Darbe girişimi, suikast, OHAL ilanı, seferberlik
  • Aktif terör saldırısı, bombalı saldırı
  • Cumhurbaşkanı/Başbakan/Meclis önemli kararı veya açıklaması (savaş ilanı, antlaşma, büyük reform yasası)
  • Merkez bankası faiz kararı, devalüasyon, borsa devre kesici
  • Türkiye'nin taraf olduğu çatışma, askeri operasyon, sınır olayı
  • Büyük ekonomik kriz, IMF/kredi derecelendirme kararı
  DÜNYA son-dakika kriterleri (herhangi biri):
  • Savaş ilanı, büyük askeri saldırı, ülke işgali
  • Büyük lider/devlet başkanı suikastı veya ölümü
  • Nükleer tehdit, biyolojik/kimyasal saldırı
  • G7/G20/BM acil kararı Türkiye'yi etkileyen
  • Küresel finans krizi, büyük borsa çöküşü (ABD/AB/Çin)
  • Büyük doğal afet (100+ ölü veya milyonlarca etkilenen)
- siyaset: Cumhurbaşkanı/TBMM/bakan/seçim/parti/referandum (son-dakika eşiği altındakiler). Belediye başkanı yerel kararı → yerel-haber.
- ekonomi: Borsa, döviz, faiz, enflasyon, TCMB, şirket bilançosu, asgari ücret
- borsa: Hisse, borsa, BİST, yatırım piyasası
- kripto: Bitcoin, kripto para, blockchain
- teknoloji: Apple/Google/Meta/AI/yazılım/siber/uzay/drone/robot
- saglik: Hastalık, ilaç, aşı, pandemi, WHO, sağlık bakanlığı
- bilim: Araştırma, keşif, NASA, iklim bilimi
- dunya: Türkiye DIŞINDA gerçekleşen önemli ama son-dakika eşiği altındaki haberler
- magazin: Ünlü kişisel hayatı, evlilik/boşanma, ilişki, skandal. isBreaking: false ZORUNLU.
- kultur: Sinema, tiyatro, opera, müze, edebiyat, ödül töreni, konser, müzik
- gastronomi: Yemek, restoran, şef, Michelin, MasterChef, tarif
- otomobil: Araç modeli, TOGG, elektrikli araç. Trafik KAZASI → yerel-haber.
- meteoroloji: Hava durumu, MGM uyarısı, fırtına, don, sel (Türkiye geneli uyarılar)
- yerel-haber: Tek il/ilçeye özgü olay. isBreaking: false ZORUNLU. Yerel kaza/olay/tören → burada, son-dakika DEĞİL.
- gundem: Türkiye geneli, yukarıdakilere girmeyen ulusal haberler. Slider/ana sayfada öne çıkan kategori.

YERELLİK TESTİ:
Aşağıdakilerin hepsi doğruysa → yerel-haber:
✓ Olay tek bir Türk şehri/ilçesinde geçiyor
✓ Diğer şehirlerde benzer etki yok
✓ Türkiye genelinde politika/yasa/ekonomi değişikliği yok

KESİN YASAKLAR (son-dakika olamaz):
- Kutlama, tören, festival, şenlik, anma etkinliği
- Babalar/anneler/öğretmenler/sevgililer günü
- Belediye hizmet/asfalt/park haberleri
- Yerel trafik kazası (tek şehir)
- Ödül töreni, konser, spor maçı sonucu
- Piyasa/araştırma raporu, akademik çalışma

ÇIKTI: Yalnızca geçerli JSON:`

function buildPrompt(input: CategoryInput): string {
  return `Kaynak: ${input.sourceLabel}
Başlık: ${input.title}
İçerik:
${input.content.slice(0, 3000)}
${input.forcedCategoryId ? `\nÖnerilen kategori: ${input.forcedCategoryId} (doğru değilse değiştir)` : ''}

JSON formatında kategori bilgisi döndür:
{
  "categoryId": "string (dunya-kupasi-2026|futbol|basketbol|voleybol|hentbol|atletizm|gures|spor|son-dakika|siyaset|ekonomi|borsa|kripto|teknoloji|saglik|bilim|dunya|magazin|kultur|gastronomi|otomobil|meteoroloji|yerel-haber|gundem)",
  "isBreaking": boolean,
  "confidence": number (0-100),
  "city": "string veya null (haberin geçtiği Türk şehri, kaynak gazete şehri DEĞİL)",
  "district": "string veya null",
  "country": "string (varsayılan: Türkiye)",
  "tags": ["string"] (3-6 etiket, küçük harf Türkçe),
  "reason": "string (kategori seçim gerekçesi)"
}`
}

const VALID_CATEGORIES = new Set([
  'son-dakika', 'siyaset', 'gundem', 'yerel-haber', 'dunya', 'ekonomi', 'borsa', 'kripto',
  'teknoloji', 'saglik', 'bilim', 'spor', 'futbol', 'basketbol', 'voleybol', 'hentbol',
  'atletizm', 'gures', 'magazin', 'kultur', 'gastronomi', 'otomobil', 'meteoroloji',
  'dunya-kupasi-2026',
])

function normalizeCategoryId(raw: string): string {
  const slug = (raw || 'gundem')
    .trim().toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return VALID_CATEGORIES.has(slug) ? slug : 'gundem'
}

async function callDeepSeek(input: CategoryInput): Promise<CategoryResult | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return null
  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-chat'

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildPrompt(input) },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) return null
    return parseResult(raw, input.forcedCategoryId)
  } catch {
    return null
  }
}

async function callGemini(input: CategoryInput): Promise<CategoryResult | null> {
  const apiKey = process.env.GEMINI_API_KEY?.trim()
  if (!apiKey) return null
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(input) }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { temperature: 0.2, maxOutputTokens: 512, responseMimeType: 'application/json' },
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
    }
    const raw = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? '')
      .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    if (!raw.startsWith('{')) return null
    return parseResult(raw, input.forcedCategoryId)
  } catch {
    return null
  }
}

function parseResult(raw: string, forcedCategoryId?: string): CategoryResult | null {
  try {
    const p = JSON.parse(raw) as {
      categoryId?: string; isBreaking?: boolean; confidence?: number
      city?: string; district?: string; country?: string; tags?: string[]; reason?: string
    }

    let categoryId = normalizeCategoryId(p.categoryId || forcedCategoryId || 'gundem')
    let isBreaking = p.isBreaking === true

    // Güvenlik override: son-dakika ise isBreaking ZORUNLU true
    if (categoryId === 'son-dakika') isBreaking = true
    // son-dakika değilse isBreaking kesinlikle false
    if (categoryId !== 'son-dakika') isBreaking = false

    // Kutlama/tören kelimesi varsa son-dakika olamaz
    const titleAndContent = raw.toLocaleLowerCase('tr-TR')
    const CELEBRATION_TERMS = [
      'kutlama', 'kutlandı', 'kutluyor', 'babalar günü', 'anneler günü',
      'mezuniyet töreni', 'anma töreni', 'açılış töreni', 'şenlik', 'festival düzenlendi',
    ]
    if (CELEBRATION_TERMS.some((t) => titleAndContent.includes(t)) && categoryId === 'son-dakika') {
      categoryId = 'gundem'
      isBreaking = false
    }

    const cityRaw = p.city?.trim()
    const city = cityRaw && cityRaw.toLowerCase() !== 'null' ? cityRaw : null
    const districtRaw = p.district?.trim()
    const district = districtRaw && districtRaw.toLowerCase() !== 'null' ? districtRaw : null
    const country = p.country?.trim() || 'Türkiye'

    return {
      categoryId,
      isBreaking,
      confidence: Math.min(100, Math.max(0, typeof p.confidence === 'number' ? p.confidence : 70)),
      city,
      district,
      country,
      tags: Array.isArray(p.tags) ? p.tags.map((t) => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 6) : [],
      reason: p.reason?.trim() || '',
    }
  } catch {
    return null
  }
}

/**
 * Heuristik fallback — AI başarısız olduğunda kural tabanlı kategori.
 */
function heuristicCategory(input: CategoryInput): CategoryResult {
  const text = `${input.title} ${input.content}`.toLocaleLowerCase('tr-TR')

  let categoryId = input.forcedCategoryId || 'gundem'

  if (/futbol|maç|gol|transfer|süper lig|tff|uefa|fifa/.test(text)) categoryId = 'futbol'
  else if (/basketbol|nba|euroleague/.test(text)) categoryId = 'basketbol'
  else if (/voleybol/.test(text)) categoryId = 'voleybol'
  else if (/teknoloji|yapay zeka|chatgpt|iphone|android|siber/.test(text)) categoryId = 'teknoloji'
  else if (/ekonomi|borsa|döviz|enflasyon|tcmb/.test(text)) categoryId = 'ekonomi'
  else if (/deprem|afet|sel/.test(text) && !/^\w+('da|'de|'ta|'te|'ın|'in)\s/.test(input.title)) categoryId = 'son-dakika'
  else if (/siyaset|cumhurbaşkan|tbmm|meclis|seçim|parti/.test(text)) categoryId = 'siyaset'
  else if (/dünya|rusya|abd|almanya|fransa|ukrayna|gazze|savaş/.test(text)) categoryId = 'dunya'

  const isBreaking = categoryId === 'son-dakika'

  // Şehir tespiti (basit)
  const TR_CITIES = ['istanbul', 'ankara', 'izmir', 'bursa', 'antalya', 'adana', 'konya',
    'kayseri', 'mersin', 'gaziantep', 'diyarbakır', 'samsun', 'trabzon', 'erzurum']
  let city: string | null = null
  for (const c of TR_CITIES) {
    if (text.includes(c)) { city = c.charAt(0).toUpperCase() + c.slice(1); break }
  }

  return {
    categoryId: normalizeCategoryId(categoryId),
    isBreaking,
    confidence: 50,
    city,
    district: null,
    country: 'Türkiye',
    tags: [],
    reason: 'heuristik fallback (AI başarısız)',
  }
}

/**
 * Stage 3 ana fonksiyon.
 * DeepSeek → Gemini → heuristik
 */
export async function classifyArticle(
  written: WrittenArticle,
  sourceLabel: string,
  forcedCategoryId?: string,
): Promise<CategoryResult> {
  const input: CategoryInput = {
    title: written.title,
    content: written.content,
    sourceLabel,
    forcedCategoryId,
  }

  console.log(`[stage3/categoryEditor] başlıyor: "${written.title.slice(0, 60)}"`)

  const deepseekResult = await callDeepSeek(input)
  if (deepseekResult) {
    console.log(`[stage3] DeepSeek → ${deepseekResult.categoryId} (güven: ${deepseekResult.confidence}) — ${deepseekResult.reason.slice(0, 80)}`)
    return deepseekResult
  }

  const geminiResult = await callGemini(input)
  if (geminiResult) {
    console.log(`[stage3] Gemini → ${geminiResult.categoryId} (güven: ${geminiResult.confidence})`)
    return geminiResult
  }

  const fallback = heuristicCategory(input)
  console.warn(`[stage3] AI başarısız — heuristik: ${fallback.categoryId}`)
  return fallback
}
