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

YERELLİK TESTİ:
Aşağıdakilerin hepsi doğruysa → yerel-haber:
✓ Olay tek bir Türk şehri/ilçesinde geçiyor
✓ Diğer şehirlerde benzer etki yok
✓ Türkiye genelinde politika/yasa/ekonomi değişikliği yok

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

function buildPrompt(input: CategoryInput): string {
  return `Kaynak: ${input.sourceLabel}
Başlık: ${input.title}
İçerik (tamamını oku — kategori kararını YALNIZCA içeriğe göre ver, kaynak adına veya başlıktaki tek bir kelimeye değil):
${input.content.slice(0, 6000)}
${input.forcedCategoryId ? `\nÖnerilen kategori: ${input.forcedCategoryId} (içerik farklı bir kategoriyi işaret ediyorsa mutlaka düzelt — bu yalnızca öneri)` : ''}

JSON formatında kategori bilgisi döndür:
{
  "categoryId": "string (dunya-kupasi-2026|futbol|basketbol|voleybol|hentbol|atletizm|gures|spor|son-dakika|siyaset|ekonomi|borsa|kripto|finans-piyasa|emlak-konut|enerji|is-kariyer|teknoloji|saglik|bilim|egitim|cevre-iklim|oyun-espor|din-inanc|dunya|kibris-haberleri|magazin|kultur|sinema|tiyatro|konser|festival|yasam|astroloji|moda|anne-cocuk|dekorasyon|iliskiler|gastronomi|otomobil|meteoroloji|turizm|gezi|tarih|asayis|yerel-haber|gundem)",
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
  const model = process.env.DEEPSEEK_NEWS_MODEL?.trim() || 'deepseek-v4-flash'

  try {
    const res = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        thinking: { type: 'disabled' },
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

    // Hard override: spor kategorisine düştüyse ama içerik uluslararası/nükleer ise düzelt
    // "nükleer yarış", "silah yarışı" gibi ifadelerde "yarış" AI'yı yanıltıyor
    if (categoryId === 'spor' || categoryId === 'futbol' || categoryId === 'atletizm') {
      const titleCheck = (p as Record<string, unknown>)['reason']
        ? '' // reason varsa AI kendinden emin, dokunma
        : ''
      const rawLower = raw.toLocaleLowerCase('tr-TR')
      const INTERNATIONAL_SIGNALS = [
        'nükleer', 'silahlanma', 'silah yarış', 'ortadoğu', 'israil', 'iran',
        'nato', 'bm ', 'uluslararası', 'abd ', 'rusya', 'ukrayna', 'çin ', 'gazze',
      ]
      const isInternational = INTERNATIONAL_SIGNALS.some((s) => rawLower.includes(s))
      if (isInternational) {
        categoryId = 'dunya'
      }
    }

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
    const categoryId = applyAstrologyCategoryOverride(
      deepseekResult.categoryId,
      input.title,
      input.content,
      deepseekResult.tags
    )
    const result =
      categoryId === deepseekResult.categoryId
        ? deepseekResult
        : {
            ...deepseekResult,
            categoryId,
            reason: `${deepseekResult.reason} [override→astroloji]`.trim(),
          }
    console.log(`[stage3] DeepSeek → ${result.categoryId} (güven: ${result.confidence}) — ${result.reason.slice(0, 80)}`)
    return result
  }

  const fallback = heuristicCategory(input)
  console.warn(`[stage3] DeepSeek başarısız — heuristik: ${fallback.categoryId}`)
  return fallback
}
