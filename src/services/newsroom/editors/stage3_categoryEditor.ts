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
import { applyAstrologyCategoryOverride } from '@/lib/categoryOverrides'
import { recordDirectDeepSeekObservation } from '@/lib/ai/deepseekClient'
import { inputCharLimit, optionalOutputTokenLimit } from '@/lib/ai/usage/tokenBudget'
import {
  STAGE3_COMPACT_ARTICLE_CHARS,
  STAGE3_COMPACT_SYSTEM,
  buildCompactStage3UserPrompt,
  shouldUseStage3CompactPrompt,
  stage3CanaryBucket,
  type Stage3PromptVariant,
} from './stage3_compactPrompt'

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
  spot?: string
  city?: string | null
  country?: string | null
  tags?: string[]
}

const SYSTEM_PROMPT = `Sen NaHaber'in kategori editörüsün. Verilen haber başlığı ve içeriğini analiz ederek kategori, son-dakika durumu ve konum bilgisi belirliyorsun.

BİRİNCİL KONU KURALI — EN ÖNEMLİ KURAL:
Haberin ANA KONUSUNU belirle, YAN ATIFLAR ve GEÇİCİ ANAHTAR KELİMELER seni yanıltmasın.

YANLIŞ → DOĞRU örnekleri:
• Erdoğan İspanya başbakanıyla görüştü, görüşmede Dünya Kupası tebriği geçti → SİYASET (ana konu: diplomasi/görüşme), FUTBOL değil
• Bakan istihdam rakamlarını açıkladı, metinde "teknoloji sektörü" geçti → EKONOMİ, TEKNOLOJİ değil
• Şehirde fuar düzenlendi, fuarda teknoloji ürünleri sergilendi → YERELHaber veya GÜNDEM, TEKNOLOJİ değil
• Meclis çevre yasasını görüştü, haberde "iklim" geçti → SİYASET, CEVRE-IKLİM değil
• Sporcunun kişisel hayatı haberi, teknik direktör evlendi → MAGAZİN, FUTBOL değil
• Şirket işçi çıkardı, şirket teknoloji sektöründe → EKONOMİ veya GÜNDEM, TEKNOLOJİ değil

⚠️ "YARIŞ" KELİMESİ TUZAĞI — ÇOK SIKÇA YANLIŞLANIYOR:
"yarış" yalnızca GERÇEK SPOR YARIŞLARI için spor/futbol/atletizm kategorisine girer:
• F1 yarışı, ata yarışı, maraton, kros, motosiklet yarışı → spor/atletizm ✓
"yarış" şu bağlamlarda KESİNLİKLE SPOR DEĞİL:
• "Nükleer yarış", "silah yarışı" → DUNYA (uluslararası güvenlik)
• "Uzay yarışı" → TEKNOLOJİ veya DUNYA
• "Seçim yarışı", "siyasi yarış" → SİYASET
• "Ekonomik yarış", "ticaret savaşı" → EKONOMİ

TESTİ: "Bu haberin BAŞLIĞI hangi kategoriyi işaret ediyor?" — İçerik değil, başlığa odaklan.
Başlıkta cumhurbaşkanı/bakan/diplomatik → SİYASET veya DUNYA
Başlıkta maç/gol/transfer/şampiyon → FUTBOL/SPOR
Başlıkta ekonomi/piyasa/enflasyon → EKONOMİ
Başlıkta iPhone/yapay zeka/yazılım/siber saldırı → TEKNOLOJİ

KATEGORİ KURALLARI (EN SPESİFİK KATEGORİYİ SEÇ):

SPOR alt kategorileri:
- dunya-kupasi-2026: YALNIZCA arşiv — 2026 FIFA Dünya Kupası turnuva arşivi. Yeni haberler için KULLANMA
- futbol: Süper Lig, Avrupa kupaları, Premier/La Liga, milli takım, transfer, dünya futbolu (Dünya Kupası sonrası dahil), FIFA/UEFA/TFF, derbi, gol
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
- dunya: Türkiye DIŞINDA gerçekleşen tüm haberler
- magazin: Ünlü kişisel hayatı, evlilik/boşanma, ilişki, skandal. isBreaking: false ZORUNLU.
- kultur: Sinema, tiyatro, opera, müze, edebiyat, ödül töreni, konser, müzik
- gastronomi: Yemek, restoran, şef, Michelin, MasterChef, tarif
- otomobil: Araç modeli, TOGG, elektrikli araç. Trafik KAZASI → yerel-haber.
- meteoroloji: Hava durumu, MGM uyarısı, fırtına, don, sel (Türkiye geneli uyarılar)
- yerel-haber: Tek il/ilçeye özgü olay. isBreaking: false ZORUNLU. Yerel kaza/olay/tören → burada, son-dakika DEĞİL.
- gundem: Türkiye geneli, yukarıdakilere girmeyen ulusal haberler. Slider/ana sayfada öne çıkan kategori.

YAŞAM ALT DALLARI (EN SPESİFİK OLANI SEÇ — ebeveyn yasam'ı yalnızca alt dal belirsizse kullan):
- astroloji: Günlük/haftalık burç yorumu, burç adı (Koç, Boğa, İkizler, Yengeç, Aslan, Başak, Terazi, Akrep, Yay, Oğlak, Kova, Balık), yükselen, gezegen retrosu, zodyak. ASLA yasam DEĞİL.
- moda: Giyim, defile, stil, güzellik
- anne-cocuk: Ebeveynlik, çocuk bakımı, hamilelik
- dekorasyon: Ev dekorasyonu, mobilya, iç mimari
- iliskiler: İlişki/evlilik rehberi (burç ilişki yorumu → astroloji; ünlü dedikodu → magazin)
- yasam: Genel yaşam — yalnızca yukarıdaki alt dallara uymuyorsa

YERELLİK vs ULUSAL — KONU (emlak/sağlık/çevre) ŞEHRİ EZMESİN:

YEREL BİRİNCİL (categoryId = yerel-* alt kategori; city doldur):
✓ Başlıkta tek şehir güçlü ("Van'da…", "Yalova'da…", "Çiftlikköy'de…")
✓ Belediye / valilik / kaymakam / ilçe / mahalle işi
✓ Tek ile ait istatistik, yerel etkinlik, yerel çevre temizliği
→ Konu emlak olsa bile → yerel-emlak (emlak-konut DEĞİL)
→ Konu sağlık olsa bile → yerel-saglik (saglik DEĞİL)
→ Konu çevre olsa bile → yerel-cevre-iklim (cevre-iklim DEĞİL)
→ Konu gastronomi/yaşam olsa bile → yerel-gastronomi / yerel-yasam

ULUSAL BİRİNCİL (ulusal kategori OK; city yalnızca konum ise doldur):
✓ Türkiye geneli / çok şehir / bakanlık-politika / TCMB-piyasa / ulusal yasa
✓ Konum yalnızca örnek veya geçiş ("İstanbul'da açıklanan faiz kararı" → finans)

ÖRNEKLER:
• "Van'da konut satışları Temmuz'da azaldı" → yerel-emlak (+ city: Van)
• "Van Gölü'nde atık toplama seferberliği" → yerel-cevre-iklim
• "Yalova'da Sağlıklı Hayat Saatleri" → yerel-saglik
• "Çiftlikköy'de kent mobilyaları üretimi" → yerel-yasam veya yerel-gundem
• "Türkiye genelinde konut satışları arttı" → emlak-konut
• "Sağlık Bakanlığı aşı takvimini açıkladı" → saglik (şehir geçse bile)

YERELLİK TESTİ (hepsi doğruysa yerel-*):
✓ Olay tek bir Türk şehri/ilçesinde geçiyor
✓ Diğer şehirlerde benzer etki yok
✓ Türkiye genelinde politika/yasa/ekonomi değişikliği yok
Genel "yerel-haber" KULLANMA — yerel-emlak|yerel-saglik|yerel-cevre-iklim|yerel-gundem|… seç.

KONUM KURALLARI (ZORUNLU):
- categoryId = dunya → country: olayın geçtiği ülke (Türkçe ad: Japonya, Almanya, ABD…). city/district: null
- categoryId = yerel-haber → city: Türk ili; district: ilçe adı varsa doldur (Gemlik, Çine…)
- Türkiye içi diğer kategoriler → country: "Türkiye"; city yalnızca olay o ile bağlıysa
- Kaynak gazete şehrini city olarak yazma — olayın geçtiği yeri yaz

ALTIN KURAL son-dakika için: "Bu haber Türkiye genelini veya uluslararası düzeni doğrudan etkiliyor mu?" → Hayır → son-dakika DEĞİL.

KESİN YASAKLAR (son-dakika olamaz):
- Kutlama, tören, festival, şenlik, anma etkinliği
- Babalar/anneler/öğretmenler/sevgililer günü
- Belediye hizmet/asfalt/park haberleri
- Yerel trafik kazası (tek şehir)
- Ödül töreni, konser, spor maçı sonucu
- Piyasa/araştırma raporu, akademik çalışma

ÇIKTI: Yalnızca geçerli JSON:`

export const STAGE3_CONTROL_SYSTEM = SYSTEM_PROMPT

export function buildControlStage3UserPrompt(input: CategoryInput): string {
  return `Kaynak: ${input.sourceLabel}
Başlık: ${input.title}
İçerik (tamamını oku — kategori kararını YALNIZCA içeriğe göre ver, kaynak adına veya başlıktaki tek bir kelimeye değil):
${input.content.slice(0, inputCharLimit('AI_STAGE3_MAX_INPUT_CHARS', 6000))}
${input.forcedCategoryId ? `\nÖnerilen kategori: ${input.forcedCategoryId} (içerik farklı bir kategoriyi işaret ediyorsa mutlaka düzelt — bu yalnızca öneri)` : ''}

JSON formatında kategori bilgisi döndür:
{
  "categoryId": "string (dunya-kupasi-2026|futbol|basketbol|voleybol|hentbol|atletizm|gures|spor|son-dakika|siyaset|ekonomi|borsa|kripto|finans-piyasa|emlak-konut|enerji|is-kariyer|teknoloji|saglik|bilim|egitim|cevre-iklim|oyun-espor|din-inanc|dunya|kibris-haberleri|magazin|kultur|sinema|tiyatro|konser|festival|yasam|astroloji|moda|anne-cocuk|dekorasyon|iliskiler|gastronomi|otomobil|meteoroloji|turizm|gezi|tarih|asayis|yerel-haber|yerel-emlak|yerel-saglik|yerel-cevre-iklim|yerel-gundem|yerel-ekonomi|yerel-gastronomi|yerel-yasam|yerel-asayis|yerel-siyaset|yerel-egitim|yerel-duyuru|gundem)",
  "isBreaking": boolean,
  "confidence": number (0-100),
  "city": "string veya null (haberin geçtiği Türk şehri, kaynak gazete şehri DEĞİL)",
  "district": "string veya null (Türk ilçe adı; yoksa null)",
  "country": "string (Türkiye veya dünya haberi için ülke adı Türkçe — örn. Japonya)",
  "tags": ["string"] (3-6 etiket, küçük harf Türkçe),
  "reason": "string (kategori seçim gerekçesi)"
}`
}

const VALID_CATEGORIES = new Set([
  'son-dakika', 'siyaset', 'gundem', 'yerel-haber', 'dunya', 'kibris-haberleri',
  'ekonomi', 'borsa', 'kripto', 'finans-piyasa', 'emlak-konut', 'enerji', 'is-kariyer',
  'teknoloji', 'saglik', 'bilim', 'egitim', 'cevre-iklim', 'oyun-espor', 'din-inanc',
  'spor', 'futbol', 'basketbol', 'voleybol', 'hentbol', 'atletizm', 'gures', 'dunya-kupasi-2026',
  'magazin', 'kultur', 'sinema', 'tiyatro', 'konser', 'festival',
  'yasam', 'astroloji', 'moda', 'anne-cocuk', 'dekorasyon', 'iliskiler',
  'gastronomi', 'otomobil', 'meteoroloji', 'turizm', 'gezi', 'tarih', 'asayis',
  'yerel-asayis', 'yerel-gundem', 'yerel-siyaset', 'yerel-spor', 'yerel-futbol',
  'yerel-basketbol', 'yerel-voleybol', 'yerel-ekonomi', 'yerel-emlak', 'yerel-saglik',
  'yerel-cevre-iklim', 'yerel-egitim', 'yerel-yasam', 'yerel-gastronomi', 'yerel-duyuru',
  'yerel-kultur', 'yerel-magazin', 'yerel-etkinlik', 'yerel-meteoroloji', 'yerel-turizm',
  'kibris-asayis',
  'kibris-gundem',
  'kibris-siyaset',
  'kibris-spor',
  'kibris-futbol',
  'kibris-basketbol',
  'kibris-voleybol',
  'kibris-hentbol',
  'kibris-atletizm',
  'kibris-gures',
  'kibris-tenis',
  'kibris-yuzme',
  'kibris-motor-sporlari',
  'kibris-ekonomi',
  'kibris-finans',
  'kibris-emlak',
  'kibris-enerji',
  'kibris-kariyer',
  'kibris-teknoloji',
  'kibris-etkinlik',
  'kibris-sinema',
  'kibris-kultur',
  'kibris-tiyatro',
  'kibris-konser',
  'kibris-festival',
  'kibris-magazin',
  'kibris-yasam',
  'kibris-saglik',
  'kibris-bilim',
  'kibris-egitim',
  'kibris-cevre-iklim',
  'kibris-din-inanc',
  'kibris-gastronomi',
  'kibris-otomobil',
  'kibris-meteoroloji',
  'kibris-turizm',
  'kibris-gezi',
  'kibris-tarih',
  'kibris-oyun-espor',
  'kibris-duyuru',
])

export function stage3ValidCategoryIds(): string[] {
  return [...VALID_CATEGORIES].sort()
}

function slugifyCategoryId(raw: string): string {
  return (raw || '')
    .trim().toLowerCase()
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function normalizeCategoryId(raw: string): string {
  const slug = slugifyCategoryId(raw || 'gundem')
  return VALID_CATEGORIES.has(slug) ? slug : 'gundem'
}

function buildCompactUserPrompt(input: CategoryInput): string {
  return buildCompactStage3UserPrompt({
    title: input.title,
    spot: input.spot,
    content: input.content,
    sourceLabel: input.sourceLabel,
    currentCategory: input.forcedCategoryId,
    city: input.city,
    country: input.country,
    tags: input.tags,
    categoryIds: stage3ValidCategoryIds(),
    maxArticleChars: STAGE3_COMPACT_ARTICLE_CHARS,
  })
}

function classifyStage3TransportError(err: unknown): string {
  const name = err instanceof Error ? err.name : ''
  const message = err instanceof Error ? err.message : String(err)
  if (name === 'TimeoutError' || name === 'AbortError' || /timeout|aborted/i.test(message)) {
    return 'timeout'
  }
  return 'provider_failure'
}

type Stage3ParseOutcome =
  | { ok: true; value: CategoryResult }
  | { ok: false; errorCode: string }

export function parseStage3Output(
  raw: string,
  opts: { strict: boolean; forcedCategoryId?: string }
): Stage3ParseOutcome {
  let p: {
    categoryId?: string
    isBreaking?: boolean
    confidence?: number
    city?: string
    district?: string
    country?: string
    tags?: string[]
    reason?: string
  }
  try {
    p = JSON.parse(raw) as typeof p
  } catch {
    return { ok: false, errorCode: 'invalid_json' }
  }
  if (!p || typeof p !== 'object') return { ok: false, errorCode: 'schema_validation' }

  const rawId = typeof p.categoryId === 'string' ? p.categoryId.trim() : ''
  if (opts.strict) {
    if (!rawId) return { ok: false, errorCode: 'missing_category' }
    const slug = slugifyCategoryId(rawId)
    if (!VALID_CATEGORIES.has(slug)) return { ok: false, errorCode: 'invalid_category' }
  }

  const parsed = parseResultFromObject(p, raw, opts.forcedCategoryId)
  if (!parsed) return { ok: false, errorCode: 'schema_validation' }
  return { ok: true, value: parsed }
}

function parseResultFromObject(
  p: {
    categoryId?: string
    isBreaking?: boolean
    confidence?: number
    city?: string
    district?: string
    country?: string
    tags?: string[]
    reason?: string
  },
  raw: string,
  forcedCategoryId?: string
): CategoryResult | null {
  let categoryId = normalizeCategoryId(p.categoryId || forcedCategoryId || 'gundem')
  let isBreaking = p.isBreaking === true

  if (categoryId === 'son-dakika') isBreaking = true
  if (categoryId !== 'son-dakika') isBreaking = false

  if (categoryId === 'spor' || categoryId === 'futbol' || categoryId === 'atletizm') {
    const rawLower = raw.toLocaleLowerCase('tr-TR')
    const INTERNATIONAL_SIGNALS = [
      'nükleer', 'silahlanma', 'silah yarış', 'ortadoğu', 'israil', 'iran',
      'nato', 'bm ', 'uluslararası', 'abd ', 'rusya', 'ukrayna', 'çin ', 'gazze',
    ]
    if (INTERNATIONAL_SIGNALS.some((s) => rawLower.includes(s))) {
      categoryId = 'dunya'
    }
  }

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
}

function promptVersionFor(variant: Stage3PromptVariant): string {
  return variant === 'compact' ? 'stage3-category:compact-v1' : 'stage3-category:v1'
}

async function callDeepSeekOnce(opts: {
  input: CategoryInput
  variant: Stage3PromptVariant
  bucket: number
  attempt: number
  fallbackReason?: string
}): Promise<{ result: CategoryResult | null; errorCode?: string }> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim()
  if (!apiKey) return { result: null, errorCode: 'missing_api_key' }
  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'
  const maxTokens = optionalOutputTokenLimit('AI_STAGE3_MAX_OUTPUT_TOKENS')
  const compact = opts.variant === 'compact'
  const systemContent = compact ? STAGE3_COMPACT_SYSTEM : SYSTEM_PROMPT
  const userContent = compact ? buildCompactUserPrompt(opts.input) : buildControlStage3UserPrompt(opts.input)
  const startedAt = Date.now()

  const note = (row: {
    success: boolean
    statusCode?: number
    errorCode?: string
    errorMessage?: string
    body?: unknown
    resultCategoryId?: string
    schemaValid?: boolean
  }) => {
    recordDirectDeepSeekObservation({
      agentName: 'stage3_category',
      operation: 'classify_category',
      promptVersion: promptVersionFor(opts.variant),
      model,
      startedAt,
      success: row.success,
      statusCode: row.statusCode,
      body: row.body,
      errorMessage: row.errorMessage,
      errorCode: row.errorCode,
      attempt: opts.attempt,
      retryCount: Math.max(0, opts.attempt - 1),
      resultCategoryId: row.resultCategoryId,
      schemaValid: row.schemaValid,
      promptVariant: opts.variant,
      stage3CanaryBucket: opts.bucket,
      canaryBucket: opts.bucket,
      fallbackReason: opts.fallbackReason ?? (row.success ? undefined : row.errorCode),
    })
  }

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
        ...(maxTokens ? { max_tokens: maxTokens } : {}),
        messages: [
          { role: 'system', content: systemContent },
          { role: 'user', content: userContent },
        ],
      }),
      signal: AbortSignal.timeout(20_000),
    })
    if (!res.ok) {
      const errorCode = `http_${res.status}`
      note({ success: false, statusCode: res.status, errorCode, errorMessage: `DeepSeek HTTP ${res.status}` })
      return { result: null, errorCode }
    }
    const json = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: unknown }
    const raw = json.choices?.[0]?.message?.content?.trim()
    if (!raw) {
      note({
        success: false,
        statusCode: 200,
        body: json,
        errorCode: 'empty_content',
        errorMessage: 'empty_content',
        schemaValid: false,
      })
      return { result: null, errorCode: 'empty_content' }
    }
    const parsed = parseStage3Output(raw, { strict: compact, forcedCategoryId: opts.input.forcedCategoryId })
    if (!parsed.ok) {
      note({
        success: false,
        statusCode: 200,
        body: json,
        errorCode: parsed.errorCode,
        errorMessage: parsed.errorCode,
        schemaValid: false,
      })
      return { result: null, errorCode: parsed.errorCode }
    }
    note({
      success: true,
      statusCode: 200,
      body: json,
      resultCategoryId: parsed.value.categoryId,
      schemaValid: true,
    })
    return { result: parsed.value }
  } catch (err) {
    const errorCode = classifyStage3TransportError(err)
    note({ success: false, errorCode, errorMessage: errorCode })
    return { result: null, errorCode }
  }
}

function finishStage3Result(input: CategoryInput, deepseekResult: CategoryResult): CategoryResult {
  const categoryId = applyAstrologyCategoryOverride(
    deepseekResult.categoryId,
    input.title,
    input.content,
    deepseekResult.tags
  )
  return categoryId === deepseekResult.categoryId
    ? deepseekResult
    : {
        ...deepseekResult,
        categoryId,
        reason: `${deepseekResult.reason} [override→astroloji]`.trim(),
      }
}

/**
 * Heuristik fallback — AI başarısız olduğunda kural tabanlı kategori.
 */
function heuristicCategory(input: CategoryInput): CategoryResult {
  // Heuristik yalnızca BAŞLIĞA bakar — içerikteki yan atıflar kategoriye dahil olmaz
  const title = input.title.toLocaleLowerCase('tr-TR')

  let categoryId = input.forcedCategoryId || 'gundem'

  if (/burç|astroloji|horoscope|zodiac|zodyak|yükselen|günlük\s*burç/.test(title)) categoryId = 'astroloji'
  else if (/maç|gol|transfer|süper lig|tff|şampiyon.*ligi|derbi/.test(title)) categoryId = 'futbol'
  else if (/basketbol|nba|euroleague/.test(title)) categoryId = 'basketbol'
  else if (/voleybol/.test(title)) categoryId = 'voleybol'
  else if (/iphone|android|chatgpt|siber saldırı|yapay zeka.*ürün|yazılım.*güncelleme/.test(title)) categoryId = 'teknoloji'
  else if (/enflasyon|döviz|faiz kararı|borsa.*kapandı|tcmb|asgari ücret/.test(title)) categoryId = 'ekonomi'
  else if (/deprem|sel felaketi|büyük afet/.test(title)) categoryId = 'son-dakika'
  else if (/cumhurbaşkanı|tbmm|meclis.*kabul|seçim|bakan.*açıkladı/.test(title)) categoryId = 'siyaset'
  else if (/nükleer yarış|silah yarışı|uzay yarışı|nükleer program|nükleer tehdit|nükleer silah/.test(title)) categoryId = 'dunya'
  else if (/rusya|ukrayna|gazze|abd.*savaş|almanya.*açıkladı|ortadoğu|israil|iran|nato|bm karar/.test(title)) categoryId = 'dunya'

  categoryId = applyAstrologyCategoryOverride(categoryId, input.title, input.content)

  const isBreaking = categoryId === 'son-dakika'

  // Şehir tespiti (basit)
  const TR_CITIES = ['istanbul', 'ankara', 'izmir', 'bursa', 'antalya', 'adana', 'konya',
    'kayseri', 'mersin', 'gaziantep', 'diyarbakır', 'samsun', 'trabzon', 'erzurum']
  let city: string | null = null
  for (const c of TR_CITIES) {
    if (title.includes(c)) { city = c.charAt(0).toUpperCase() + c.slice(1); break }
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
 * Compact canary: one compact call, optional single control fallback. No double-call on success.
 * DeepSeek → heuristik (Gemini Stage3 path is not used).
 */
export async function classifyArticle(
  written: WrittenArticle,
  sourceLabel: string,
  forcedCategoryId?: string,
): Promise<CategoryResult> {
  const input: CategoryInput = {
    title: written.title,
    content: written.content,
    spot: written.spot || written.summary,
    sourceLabel,
    forcedCategoryId,
  }

  console.log(`[stage3/categoryEditor] başlıyor: "${written.title.slice(0, 60)}"`)

  const bucket = stage3CanaryBucket()
  const useCompact = shouldUseStage3CompactPrompt()

  if (useCompact) {
    const compact = await callDeepSeekOnce({
      input,
      variant: 'compact',
      bucket,
      attempt: 1,
    })
    if (compact.result) {
      const result = finishStage3Result(input, compact.result)
      console.log(`[stage3] DeepSeek compact → ${result.categoryId} (güven: ${result.confidence}) — ${result.reason.slice(0, 80)}`)
      return result
    }
    const control = await callDeepSeekOnce({
      input,
      variant: 'control_fallback',
      bucket,
      attempt: 2,
      fallbackReason: compact.errorCode || 'provider_failure',
    })
    if (control.result) {
      const result = finishStage3Result(input, control.result)
      console.log(`[stage3] DeepSeek control_fallback → ${result.categoryId} (güven: ${result.confidence})`)
      return result
    }
  } else {
    const control = await callDeepSeekOnce({
      input,
      variant: 'control',
      bucket,
      attempt: 1,
    })
    if (control.result) {
      const result = finishStage3Result(input, control.result)
      console.log(`[stage3] DeepSeek → ${result.categoryId} (güven: ${result.confidence}) — ${result.reason.slice(0, 80)}`)
      return result
    }
  }

  const fallback = heuristicCategory(input)
  console.warn(`[stage3] DeepSeek başarısız — heuristik: ${fallback.categoryId}`)
  return fallback
}
