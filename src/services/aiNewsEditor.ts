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
  // Spor ana + alt kategoriler
  spor: 'Spor',
  futbol: 'Futbol',
  basketbol: 'Basketbol',
  voleybol: 'Voleybol',
  hentbol: 'Hentbol',
  atletizm: 'Atletizm',
  gures: 'Güreş',
  dunya: 'Dünya',
  teknoloji: 'Teknoloji',
  saglik: 'Sağlık',
  kultur: 'Kültür',
  gastronomi: 'Gastronomi',
  magazin: 'Magazin',
  bilim: 'Bilim',
  meteoroloji: 'Meteoroloji',
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
  weather: 'meteoroloji',
  meteorology: 'meteoroloji',
  'hava-durumu': 'meteoroloji',
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

/** DeepSeek — aktif AI sağlayıcısı (Gemini pipeline'dan önce dener, burası yedek) */
function getActiveAiConfig(): AiProviderConfig | null {
  return getDeepSeekConfig()
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

function appendSourceAttribution(body: string, _sourceLabel: string): string {
  return body.trim()
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

const CATEGORY_CLASSIFICATION_RULES = `════════════════════════════════════════════════════════
KATEGORİ KARAR AĞACI — ADIM ADIM UYGULA (sırayı atla)
════════════════════════════════════════════════════════

ADIM 1 — COĞRAFYA KONTROLÜ
  • Olay Türkiye DIŞINDA mı? → KESİNLİKLE "dunya". Kaynak Türkçe gazete olsa bile.
    Örnekler: Ukrayna savaşı, ABD seçimi, Gazze, AB kararı, yabancı lider açıklaması.
  • Coğrafya Türkiye içindeyse → ADIM 2'ye geç.

ADIM 2 — SPOR KONTROLÜ
  • Futbol haberi? → "futbol". Basketbol? → "basketbol". Voleybol? → "voleybol".
    Hentbol → "hentbol". Atletizm → "atletizm". Güreş → "gures".
    F1/MotoGP/tenis/boks/yüzme/kayak/golf → "spor".
  • Spor değilse → ADIM 3'e geç.

ADIM 3 — UZMAN KATEGORİ KONTROLÜ (eşleşirse dur, devam etme)
  • Ekonomi (borsa/döviz/faiz/enflasyon/TCMB/şirket bilançosu/kripto) → "ekonomi"
  • Siyaset (Cumhurbaşkanı kararı, TBMM, parti haberi, seçim) → "siyaset"
  • Teknoloji (Apple/Google/AI/yazılım/siber/uzay/drone/robot) → "teknoloji"
  • Sağlık (hastalık/ilaç/pandemi/aşı/WHO/sağlık bakanlığı) → "saglik"
  • Bilim (araştırma/keşif/NASA/uzay bilimi/iklim bilimi) → "bilim"
  • Hava durumu / MGM uyarısı / fırtına / sıcaklık rekoru → "meteoroloji"
  • Yemek/restoran/şef/tarif/Michelin/MasterChef → "gastronomi"
  • Araba/araç/TOGG/trafik/motosiklet → "otomobil" (KURAL: trafik kazası → yerel-haber veya gundem, otomobil değil)
  • Sinema/tiyatro/opera/müze/edebiyat/ödül töreni → "kultur"
  • Konser/müzik etkinliği/albüm çıkışı → "kultur"
  • Ünlü özel hayatı/evlilik-boşanma/dizi fragmanı/dedikodu → "magazin"
  • Hiçbiri eşleşmiyorsa → ADIM 4'e geç.

ADIM 4 — YEREL mi ULUSAL mi? (EN KRİTİK ADIM)

  ┌─ YERELLİK TESTİ ──────────────────────────────────────────┐
  │  Aşağıdakilerin HEPSİ doğruysa → "yerel-haber":           │
  │  ✓ Olay TAM OLARAK tek bir Türk şehri/ilçesinde geçiyor   │
  │  ✓ Diğer şehirlerde benzer bir etki/sonuç yaratmıyor      │
  │  ✓ Türkiye genelinde politika/yasa/ekonomi değişikliği YOK│
  └────────────────────────────────────────────────────────────┘

  YERELLİK TESTİ ÖRNEKLERİ — yerel-haber seç:
    "Konya'da trafik kazası: 2 yaralı"         → yerel-haber
    "Trabzon Belediyesi park yapıyor"           → yerel-haber
    "Erzurum'da bıçaklı kavga"                 → yerel-haber
    "İzmir'de berber emeklilere döner ısmarlıyor" → yerel-haber
    "Adana'da uyuşturucu operasyonu"            → yerel-haber
    "Bursa'da yangın çıktı, 1 kişi öldü"       → yerel-haber
    "Mersin'de kaplumbağa kurtarıldı"           → yerel-haber
    "Gaziantep Büyükşehir metroyu açıyor"       → yerel-haber
    "Kayseri Valisi açıklama yaptı"             → yerel-haber
    "Antalya'da tatilci denizde boğuldu"        → yerel-haber

  ULUSAL TEST ÖRNEKLERİ — gundem veya son-dakika seç:
    "İstanbul'da 6.5 büyüklüğünde deprem"      → son-dakika (tüm ülke etkisi)
    "Türkiye genelinde sel uyarısı verildi"     → gundem (Türkiye geneli)
    "Türkiye-Yunanistan sınırında gerilim"      → siyaset/dunya
    "Asgari ücret zammı açıklandı"              → ekonomi (ulusal)
    "Ankara'da büyük terör saldırısı"           → son-dakika

  SINIR DURUMLARI — hep yerel-haber:
    ✗ "Büyük" veya "feci" kelimesi tek şehir olayını ulusal yapmaz
    ✗ Ölü sayısı az bile olsa tek şehirde kaldıysa → yerel-haber
    ✗ Belediye başkanı konuşması → yerel-haber (siyaset DEĞİL)
    ✗ Valilik açıklaması → yerel-haber
    ✗ Yerel spor kulübü haberi → yerel-haber (futbol/spor DEĞİL)

ADIM 5 — GÜNDEM mi SON DAKİKA mı?
  Eğer ulusal/genel bir Türkiye haberi ise:

  "gundem" → TÜM ŞUNLAR için:
    Genel kamu haberleri, çok ölümlü ama sınırlı etki bırakmış kazalar,
    hükümet duyurusu (politika değil), doğal olaylar (küçük çaplı).
    isBreaking = false ZORUNLU.

  "son-dakika" → YALNIZCA şunlar için (biri yeterlı):
    (1) Deprem 4.5 büyüklük veya üzeri
    (2) Büyük afet: onlarca ölü VEYA toplu tahliye/kentsel yıkım
    (3) Darbe girişimi, suikast, devlet başkanına saldırı
    (4) Türkiye'yi doğrudan etkileyen aktif savaş/terör saldırısı
    (5) Anlık kritik ekonomik çöküş: borsa devre kesici, döviz serbest düşüşü
    (6) Hükümet olağanüstü hal / seferberlik ilanı
    isBreaking = true ZORUNLU.

  ALTIN KURAL: "Bu haber ŞU AN Türkiye'nin 5'ten fazla ilini veya tüm
  ekonomisini doğrudan etkiliyor mu?" → Hayır ise → son-dakika DEĞİL.

════════════════════════════════════════════════════════
KATEGORİ TANIMLARI (referans)
════════════════════════════════════════════════════════

- futbol: Futbol maçı, gol, Süper Lig/CL/Premier Lig/La Liga, transfer, teknik direktör, TFF, UEFA, FIFA, derbi.
- basketbol: NBA, EuroLeague, Anadolu Efes, Fenerbahçe Beko, basketbol maç/transfer/play-off.
- voleybol: Voleybol maç/kupa, Efeler/Sultanlar Ligi, milli voleybol takımı.
- hentbol: Hentbol maç/turnuva/transfer.
- atletizm: Koşu, maraton, olimpiyat atletizm, dünya rekoru.
- gures: Güreş, dünya/olimpiyat güreş şampiyonası.
- spor: Diğer spor — F1, tenis, boks, yüzme, kayak, golf, olimpiyat (dal belli değilse). isBreaking=false.
- siyaset: Cumhurbaşkanı/TBMM/bakan kararı, seçim, parti haberi, koalisyon, referandum. NOT: Belediye başkanı yerel kararı → yerel-haber.
- ekonomi: Borsa, döviz, faiz, enflasyon, TCMB, şirket bilançosu, kripto, asgari ücret, ihracat istatistiği.
- teknoloji: Apple/Google/Meta/AI/yazılım/siber saldırı/uzay/drone/robot/sosyal medya platform değişikliği.
- saglik: Hastalık, ilaç, aşı, pandemi/salgın, WHO, sağlık bakanlığı açıklaması.
- bilim: Araştırma, keşif, NASA, uzay bilimi, iklim bilimi, fizik/kimya bulgusu.
- meteoroloji: Hava durumu tahmini, MGM uyarısı, don/kar/yağmur/fırtına/sıcaklık rekoru. Tüm hava haberleri buraya girer — bilim değil.
- gastronomi: Yemek tarifi, restoran haberi, şef, Michelin, MasterChef, mutfak kültürü, food blogger.
- otomobil: Araç modeli tanıtımı, TOGG, elektrikli araç, otomotiv sektörü. NOT: trafik kazası → yerel-haber veya gundem.
- kultur: Sinema, tiyatro, opera, müze, edebiyat, ödül töreni (Oscar/Nobel vb.), konser, müzik albümü.
- magazin: Ünlü özel hayatı, evlilik/boşanma, dizi fragmanı, dedikodu, celebrity. isBreaking=false.
- dunya: Türkiye dışında gerçekleşen TÜM haberler — kaynak Türkçe olsa bile.
- gundem: Türkiye genelini etkileyen, yukarıdaki spesifik kategorilere girmeyen ulusal haberler. ASLA tek şehir olayı için kullanma.
- yerel-haber: Tek il/ilçeye özgü olay. isBreaking=false ZORUNLU. Ölü sayısı, dramatik içerik, büyük manşet hiçbir yerel haberi gündem/son-dakika yapmaz.
- son-dakika: Yalnızca ADIM 5'teki kriterlerden biri sağlandığında. isBreaking=true ZORUNLU.

isBreaking kuralı: son-dakika → true; diğer tüm kategoriler → false.
categoryConfidence: kesin eşleşme 88-100, iyi eşleşme 75-87, belirsiz 55-74.`

const EDITORIAL_RULES = `TEMEL EDİTÖRYEL KURALLAR:
- ÇIKTI DİLİ: Her zaman Türkçe. Kaynak İngilizce/Arapça/başka dilde olsa bile TÜRKÇE çeviri + yeniden yazma yap.
- ASLA kaynak metni kelimesi kelimesine kopyalama. Özgün Türkçe gazete dili.
- title, spot, summary, content HEPSİ birbirinden farklı bilgi sunsun — kopyalama.
- Paragraflar arası \\n\\n kullan. Cümle ortasında satır kırma yapma.
- İÇERİK KALİTE KURALI: title/spot/summary/content HİÇBİR ZAMAN noktalı virgül (;), virgül (,), tire (-/—), üç nokta (...), açılış parantezi ile başlamamalı. RSS'ten kesik gelmiş cümleler tespit edilirse TAMAMEN YENİDEN YAZ — yarım cümle asla yayınlama.
- KAYNAK ŞEHRİ KARIŞIKLIĞI (KRİTİK KURAL):
  * city alanı için KAYNAK GAZETENİN şehrini ASLA kullanma. Haberin KONUSUNUN geçtiği Türk şehrini yaz.
  * Bursa Gazetesi → İngiltere haberi: city=null, country="İngiltere", category="dunya"
  * Antalya Ekspres → Gazze haberi: city=null, country="Filistin", category="dunya"
  * Hürriyet → Ankara kararı: city="Ankara", country="Türkiye"
  * Olay yurt dışında geçiyorsa: city=null, country=olayın geçtiği ülke adı (Türkçe), category="dunya"
- TAGS KURALI: tags dizisine KAYNAK GAZETENİN ŞEHRİNİ ekleme. Sadece haberin konusuyla ilgili etiketler ekle. "Bursa Gazetesi"nden İngiltere haberi geliyorsa tags'e "bursa" ekleme.
- KAYNAK AJANS/GAZETE ADI YASAK: İçerikte "Anka Ajansı", "AA", "DHA", "İHA", "Bursa Gazetesi" gibi kaynak ajans veya gazete adı ASLA yazma. Haber NaHaber editörü tarafından yazılıyormuş gibi kaleme al. Alıntı gerektiğinde yalnızca birincil kaynağı (kişi/kurum) referans göster.
- ÇIKTI KALİTE ZORUNLULUĞU:
  * content alanı minimum 150 kelime içermelidir.
  * content içinde HTML tag, JSON yapısı ({\\"className\\":), React/Next.js kodu, script bloğu, self.__next_f gibi teknik içerik KESİNLİKLE yasak.
  * Kaynak içerik teknik veri (HTML/JSON/JS) içeriyorsa YALNIZCAoriginalTitle + originalSummary'den yararlanarak haber yaz; teknik içeriği kopyalama.
  * title en az 5 kelime, spot en az 3 cümle içermelidir.
  * content başlıkla birebir aynı cümleyle başlamamalıdır.`

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

/**
 * Detect RSC / Next.js / HTML / JSON payload pollution in extracted text.
 * Returns true if the text looks like technical data rather than article prose.
 */
function isGarbageContent(text: string): boolean {
  const markers = [
    'self.__next_f.push',
    '["$","$L',
    '"className":"',
    '"children":[',
    '$RC("',
    '$RS("',
    'self.__next_f',
    'application/ld+json',
    '\\u003c',  // HTML entity in JSON
  ]
  let hits = 0
  for (const m of markers) {
    if (text.includes(m)) hits++
    if (hits >= 2) return true
  }
  // Also reject if content is > 30% JSON-like characters
  const jsonChars = (text.match(/[{}[\]":\\]/g) || []).length
  if (text.length > 200 && jsonChars / text.length > 0.3) return true
  return false
}

/** Strip any RSC/HTML/script pollution from content before sending to AI */
function sanitizeContentForAi(content: string): string {
  if (!content) return ''
  // Remove self.__next_f.push(...) lines
  let cleaned = content.replace(/self\.__next_f\.push\([^)]*\)/g, '')
  // Remove lines that look like RSC node arrays
  cleaned = cleaned.replace(/\["\$",[^\n]{0,500}\]/g, '')
  // Remove JSON-like structures
  cleaned = cleaned.replace(/\{[^{}]{0,200}\}/g, '')
  // Remove script-like content
  cleaned = cleaned.replace(/\$R[CS]\([^)]*\)/g, '')
  // Clean up residue
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
  return cleaned
}

function buildUserPrompt(input: AiRewriteInput): string {
  // Sanitize content before passing to AI
  let rawContent = input.originalContent || input.originalSummary || ''
  if (isGarbageContent(rawContent)) {
    // Discard garbage — AI will rewrite from title + summary only
    rawContent = input.originalSummary || ''
    console.warn(`[aiNewsEditor] RSC/HTML garbage detected in content, using summary only for: "${input.originalTitle?.slice(0, 60)}"`)
  } else {
    rawContent = sanitizeContentForAi(rawContent)
  }

  const excerpt = rawContent.slice(0, 3500) || input.originalTitle
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
    throw new Error('AI sağlayıcısı yapılandırılmamış (DEEPSEEK_API_KEY gerekli)')
  }

  console.log(`[aiNewsEditor] ${primary.provider} kullanılıyor (${primary.model})`)

  let res = await callSingleProvider(primary, input)

  // 429 rate-limit → retry once after short wait
  if (res.status === 429) {
    console.warn(`[aiNewsEditor] DeepSeek 429, 3s sonra tekrar deneniyor`)
    await new Promise((r) => setTimeout(r, 3000))
    res = await callSingleProvider(primary, input)
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

  // Çıktı kalite kontrolü — teknik içerik varsa reddet
  const aiContentBody = parsed.content?.trim() || parsed.description?.trim() || ''
  if (isGarbageContent(aiContentBody)) {
    throw new Error(`[aiNewsEditor] AI çıktısında teknik içerik (RSC/HTML/JSON) tespit edildi — yayın atlandı: "${input.originalTitle.slice(0, 60)}"`)
  }

  // Minimum içerik uzunluğu kontrolü
  const aiWordCount = aiContentBody.split(/\s+/).filter(Boolean).length
  if (aiWordCount < 30 && input.originalContent.length > 100) {
    console.warn(`[aiNewsEditor] AI çok kısa içerik döndürdü (${aiWordCount} kelime): "${input.originalTitle.slice(0, 60)}"`)
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
/** Strip Turkish RSS "read more" truncation artifacts from content */
function sanitizeRssContent(text: string): string {
  return text
    // "Devamı için tıklayın", "Devamı iç...", "Devamını oku", etc.
    .replace(/\s*Devam[ıi]\s*(için|iç[^a-z]|oku[^y]|etmek).*$/i, '')
    .replace(/\s*Haberin devam[ıi].*$/i, '')
    .replace(/\s*Haber[i]n?\s+tam[a-z]*\s+(için|metin).*$/i, '')
    .replace(/\s*\[.*?\]/g, '')          // [Devamı için tıklayın]
    .replace(/\s*\(devam[ıi].*?\)/gi, '')
    .replace(/\s*…+$/, '')              // trailing ellipsis
    .replace(/\s*\.{3,}$/, '')          // trailing dots
    .trim()
}

function fallbackRewrite(input: AiRewriteInput): AiRewriteResult | AiArchiveRewriteResult {
  // RSC/Next.js garbage kontrolü — garbage ise sadece summary'yi kullan
  const rawContent = input.originalContent || ''
  const cleanContent = isGarbageContent(rawContent)
    ? sanitizeRssContent(input.originalSummary || '')
    : sanitizeRssContent(rawContent) || sanitizeRssContent(input.originalSummary || '')

  const rawBase = cleanContent

  // If content is still too short after sanitization, refuse to publish garbage
  if (rawBase.trim().length < 80) {
    throw new Error(`[aiNewsEditor] fallback içerik çok kısa (${rawBase.length} chars) — AI key eksik, yayın atlandı: "${input.originalTitle.slice(0, 60)}"`)
  }

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
      console.warn('[aiNewsEditor] DEEPSEEK_API_KEY eksik — ham metin fallback')
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
