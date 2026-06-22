/**
 * Category Engine — normalizes AI-assigned categories, applies editor overrides,
 * and post-validates with keyword heuristics.
 */
import { AI_NEWS_CATEGORIES } from '@/services/aiNewsEditor'
import type { NewsroomEditorType } from '@/services/newsroom/types'

const CATEGORY_ALIASES: Record<string, string> = {
  'breaking-news': 'son-dakika',
  breaking: 'son-dakika',
  trending: 'trend',
  trend: 'trend',
  influencer: 'influencer',
  magazin: 'magazin',
  politics: 'siyaset',
  economy: 'ekonomi',
  sports: 'spor',
  world: 'dunya',
  technology: 'teknoloji',
  health: 'saglik',
  culture: 'kultur',
  science: 'bilim',
  general: 'gundem',
  local: 'yerel-haber',
  'local-news': 'yerel-haber',
  yerel: 'yerel-haber',
  'yerel-haber': 'yerel-haber',
  gastronomi: 'gastronomi',
  yemek: 'gastronomi',
  food: 'gastronomi',
  otomobil: 'otomobil',
  automobile: 'otomobil',
  car: 'otomobil',
  futbol: 'futbol',
  football: 'futbol',
  soccer: 'futbol',
  basketbol: 'basketbol',
  basketball: 'basketbol',
  voleybol: 'voleybol',
  volleyball: 'voleybol',
  hentbol: 'hentbol',
  atletizm: 'atletizm',
  athletics: 'atletizm',
  gures: 'gures',
  wrestling: 'gures',
  sinema: 'sinema',
  cinema: 'sinema',
  film: 'sinema',
  tiyatro: 'tiyatro',
  theatre: 'tiyatro',
  theater: 'tiyatro',
  konser: 'konser',
  concert: 'konser',
  festival: 'festival',
}

/** Extended categories beyond aiNewsEditor defaults. */
export const NEWSROOM_CATEGORIES: Record<string, string> = {
  ...AI_NEWS_CATEGORIES,
  trend: 'Trend',
  influencer: 'Influencer',
  'yerel-haber': 'Yerel Haber',
  gastronomi: 'Gastronomi',
  otomobil: 'Otomobil',
  futbol: 'Futbol',
  basketbol: 'Basketbol',
  voleybol: 'Voleybol',
  hentbol: 'Hentbol',
  atletizm: 'Atletizm',
  gures: 'Güreş',
  sinema: 'Sinema',
  tiyatro: 'Tiyatro',
  konser: 'Konser',
  festival: 'Festival',
}

const VALID_IDS = new Set(Object.keys(NEWSROOM_CATEGORIES))

const TEKNOLOJI_KEYWORDS = [
  'iphone', 'android', 'ios ', 'ios1', 'ios2', 'ipad', 'macbook', 'apple',
  'google', 'microsoft', 'meta ', 'tesla', 'samsung', 'xiaomi', 'huawei',
  'yapay zeka', 'yapay zekâ', 'chatgpt', 'openai', 'gemini', 'claude',
  'artificial intelligence', 'machine learning', 'deep learning',
  'uygulama güncelleme', 'yazılım güncelleme', 'güncelleme alacak',
  'sosyal medya', 'twitter', 'instagram', 'tiktok', 'youtube', 'whatsapp',
  'siber saldırı', 'veri ihlali', 'hack', 'siber güvenlik',
  'elektrikli araç', 'elektrikli otomobil', 'otonom araç',
  'uzay roketi', 'spacex', 'nasa', 'starlink', 'uydu fırlatma',
  'drone', 'robot', 'metaverse', 'blockchain', 'nft',
  'oyun konsolu', 'playstation', 'xbox', 'nintendo',
  'işlemci', 'grafik kartı', 'gpu', 'cpu', 'bilgisayar',
] as const

// ── Otomobil / Motorlu taşıt keyword'leri ────────────────────────────────────
const OTOMOBIL_KEYWORDS = [
  // Araç türleri
  'otomobil', 'kamyon', 'kamyonet', 'minibüs', 'minibus', 'midibüs',
  'elektrikli otobüs', 'elektrikli otobus', 'otonom otobüs', 'otonom otobus',
  'hibrit araç', 'hibrit otomobil', 'elektrikli araç', 'elektrikli otomobil',
  'otonom araç', 'sürücüsüz araç', 'surucusuz arac',
  // Üreticiler (Türkçe ilgili)
  'karsan', 'togg', 'ford otosan', 'tofaş', 'tofas', 'oyak renault',
  'mercedes benz türk', 'man türkiye', 'man turkiye',
  // Otomotiv terimleri
  'araç üretim', 'arac uretim', 'araç satış', 'arac satis',
  'otomotiv', 'otomotiv sektör', 'araç ihracat', 'araç pazar',
  'motor gücü', 'motor gucu', 'beygir gücü', 'yakıt tüketim',
  'şarj istasyonu', 'sarj istasyonu', 'elektrik motoru',
  'toplu taşıma araç', 'toplu tasima arac', 'ulaşım aracı',
  'busworld', 'eurotruck', 'iaa', 'automechanika',
  'araç ruhsat', 'egzoz muayene', 'trafik muayene',
] as const

const SIYASET_KEYWORDS = [
  'cumhurbaşkanı', 'cumhurbaskani', 'başbakan', 'basbakan',
  'tbmm', 'meclis', 'milletvekili', 'bakan ',
  'seçim', 'secim', 'oy oranı', 'sandık',
  'akp', 'chp', 'mhp', 'hdp', 'dem parti', 'iyi parti',
  'muhalefet', 'iktidar', 'hükümet', 'hukumet',
  'koalisyon', 'referandum', 'anayasa değişikliği',
  'belediye başkanı soruşturma', 'gözaltına alındı', 'tutuklandı',
  'siyasi kriz', 'parti genel başkanı', 'genel başkan',
  'vali atama', 'kabine değişikliği', 'bakan değişikliği',
  'özgür özel', 'erdoğan', 'imamoğlu', 'yıldırım direnç',
  'parti meclisi', 'kurultay', 'oy hakkı',
] as const

/** Dünya/uluslararası haber sinyalleri */
const DUNYA_KEYWORDS = [
  'abd ', 'abd\'', 'amerikan', 'pentagon', 'kongre ',
  'putin ', 'kremlin', 'rusya ', 'ukrayna',
  'çin ', 'çin,', 'pekin', 'beijing', 'şi jinping',
  'nato ', 'avrupa birliği', 'ab ', 'brüksel',
  'birleşmiş milletler', 'bm ', 'bm,',
  'japonya', 'hindistan', 'pakistan', 'iran ', 'israil',
  'filistin', 'gazze', 'lübnan', 'suriye',
  'savunma bakanı', 'dışişleri bakanı',
  'büyükelçi', 'büyükelçilik', 'konsolosluk',
  'uluslararası', 'küresel ', 'dünya lideri',
  'g7 ', 'g20 ', 'imf ', 'dünya bankası',
  'yaptırım', 'ekonomik yaptırım', 'ticaret savaşı',
  'füze denemesi', 'nükleer', 'savaş uçağı',
  'filipinler', 'avustralya', 'almanya', 'fransa',
  'ingiltere', 'kanada', 'brezilya', 'meksika',
  'güney kore', 'kuzey kore', 'taiwan',
] as const

const EKONOMI_KEYWORDS = [
  'borsa', 'dolar kuru', 'euro kuru', 'döviz kuru', 'merkez bankası',
  'tcmb', 'faiz oranı', 'enflasyon', 'tüfe', 'üfe',
  'bütçe açığı', 'bütçe fazlası', 'ihracat rakamı', 'ithalat',
  'işsizlik oranı', 'gsyih', 'büyüme oranı', 'resesyon',
  'bitcoin', 'kripto para', 'kripto ', 'kripto,', 'ethereum', 'altcoin',
  'borsa endeksi', 'bist',
  'hisse senedi', 'şirket kârı', 'şirket zararı', 'halka arz',
  'vergi düzenlemesi', 'sgk primi', 'asgari ücret',
  'menkul', 'menkul kıymet', 'menkul değer',
  'yatırım fonu', 'portföy', 'vadeli işlem', 'fintech',
  'şirket satın', 'satın aldı', 'birleşme', 'devralma',
  'pay senedi', 'temettü', 'emisyon', 'tahvil', 'bono',
  'altın fiyat', 'gümüş fiyat', 'petrol fiyat',
] as const

const SPOR_KEYWORDS = [
  'maç',
  'mac',
  'gol',
  'lig',
  'transfer',
  'fifa',
  'uefa',
  'basketbol',
  'futbol',
  'voleybol',
  'tenis',
  'atlet',
  'milli takım',
  'milli takim',
  'süper lig',
  'super lig',
  'derbi',
  'şampiyonluk',
  'sampiyonluk',
  'dünya kupası',
  'dunya kupasi',
  'world cup',
  'euro 202',
  'euro202',
  'şampiyonlar ligi',
  'sampiyonlar ligi',
  'champions league',
  'penaltı',
  'penalti',
  'kaleci',
  'forvet',
  'teknik direktör',
  'teknik direktor',
  'stadyum',
  'tff',
  'nba',
  'formula 1',
  'formula1',
  'motogp',
  'olimpiyat',
] as const

// ── Spor alt dalı keyword'leri ────────────────────────────────────────────────
const FUTBOL_KEYWORDS = [
  'futbol', 'süper lig', 'super lig', 'şampiyonlar ligi', 'sampiyonlar ligi',
  'champions league', 'premier lig', 'la liga', 'serie a', 'bundesliga',
  'galatasaray', 'fenerbahçe', 'fenerbahce', 'beşiktaş', 'besiktas', 'trabzonspor',
  'gol', 'penaltı', 'penalti', 'kaleci', 'forvet', 'hücum', 'savunma',
  'tff', 'uefa', 'fifa', 'derbi', 'lig maç', 'teknik direktör', 'teknik direktor',
  'golcü', 'golcu', 'kupa maç', 'stadyum', 'saha gol', 'futbolcu',
  'kırmızı kart', 'kirmizi kart', 'sarı kart', 'sari kart', 'hakem kararı',
  'dünya kupası futbol', 'dunya kupasi futbol', 'milli takım maç',
] as const

const BASKETBOL_KEYWORDS = [
  'basketbol', 'nba', 'euroleague', 'bsbl', 'bsl',
  'üç sayı', 'uc savi', 'basket maç', 'basketbol lig',
  'anadolu efes', 'fenerbahçe beko', 'fenerbahce beko',
  'ribaund', 'asist sayı', 'basketbol kupası', 'basketbol turnuva',
  'play-off basketbol', 'playoff basketbol', 'nba maç', 'nba transfer',
] as const

const VOLEYBOL_KEYWORDS = [
  'voleybol', 'set kazandı', 'smaç', 'smac', 'servis voleybol',
  'blok voleybol', 'voleybol lig', 'voleybol maç', 'voleybol kupası',
  'tkbl', 'efeler lig', 'sultanlar lig', 'voleybol milli', 'voleybol transfer',
  'hentbol', // hentbol da spor'un alt kategorisi
] as const

// ── Gastronomi keyword'leri ───────────────────────────────────────────────────
const GASTRONOMI_KEYWORDS = [
  'yemek tarif', 'yemek festival', 'yemek kültür', 'gastronomi', 'gurme',
  'restoran', 'lokanta', 'mutfak', 'şef', 'aşçı', 'asci', 'pişirme', 'pisirme',
  'pizza', 'burger', 'kebab', 'baklava', 'tatlı tarif', 'tatli tarif',
  'kahvaltı tarif', 'kahvalti tarif', 'yemek blogg', 'food blog',
  'michelin yıldız', 'michelin yildiz', 'fine dining', 'street food',
  'yemek yarışma', 'masterchef', 'top chef', 'yemek yap', 'tarif nasıl',
  'lezzet', 'damak', 'sofra', 'pişirme teknik', 'fırın tarif',
] as const

const MAGAZIN_KEYWORDS = [
  'magazin',
  'ünlü',
  'unlu',
  'celebrity',
  'dizi',
  'fragman',
  'evlilik',
  'ayrılık',
  'ayrilik',
  'dedikodu',
  'paparazzi',
  'show haber',
  'sanatçı',
  'sanatci',
  'yeni sezon',
  'sezon final',
  'final bölüm',
  'bölüm yayın',
  'netflix dizi',
  'disney dizi',
  'amazon dizi',
  'dizide kim',
  'dizi oyuncu',
  'oyuncu kadro',
  'tv yıldız',
  'ekrana geliyor',
  'ekranda başlıyor',
  'yayına giriyor',
  'çift ayrıldı',
  'sevgilisi',
  'nişanlandı',
  'boşandı',
  'hamile kaldı',
] as const

const BILIM_KEYWORDS = [
  'ufo', 'uzaylı', 'uzay ', 'uzay,', 'galaksi', 'asteroid', 'meteor',
  'nasa', 'bilim insanı', 'araştırma bulgusu', 'keşfedildi', 'keşfetti',
  'iklim değişikliği', 'sera gazı', 'ekoloji', 'çevre kirliliği',
  'genetik', 'dna ', 'rna ', 'virüs araştırma', 'aşı araştırma',
  'kuantum', 'yapay zeka araştırma', 'nörobilim', 'biyoteknoloji',
  'fizik deneyi', 'kimyasal bileşik', 'fosil bulundu', 'evrim',
  'uzay istasyonu', 'roket fırlatma', 'ay yüzey', 'mars görevi',
  'teleskop görüntü', 'yıldız patlama', 'kara delik', 'güneş fırtına',
  'gizemli nesne', 'tanımlanamayan', 'araştırmacılar', 'bilim dünyası',
] as const

function hasBilimKeywords(text: string): boolean {
  return containsKeyword(text, BILIM_KEYWORDS)
}

function hasOtomobilKeywords(text: string): boolean {
  return containsKeyword(text, OTOMOBIL_KEYWORDS)
}

function hasFutbolKeywords(text: string): boolean {
  return containsKeyword(text, FUTBOL_KEYWORDS)
}

function hasBasketbolKeywords(text: string): boolean {
  return containsKeyword(text, BASKETBOL_KEYWORDS)
}

function hasVoleybolKeywords(text: string): boolean {
  return containsKeyword(text, VOLEYBOL_KEYWORDS)
}

function hasGastronomiKeywords(text: string): boolean {
  return containsKeyword(text, GASTRONOMI_KEYWORDS)
}

/**
 * Spor haberinde hangi alt dal olduğunu tespit eder.
 * Öncelik sırası: futbol > basketbol > voleybol > genel spor
 */
function detectSportSubcategory(text: string): 'futbol' | 'basketbol' | 'voleybol' | null {
  if (hasFutbolKeywords(text)) return 'futbol'
  if (hasBasketbolKeywords(text)) return 'basketbol'
  if (hasVoleybolKeywords(text)) return 'voleybol'
  return null
}

const KULTUR_KEYWORDS = [
  'sinema',
  'tiyatro',
  'sergi',
  'müzik',
  'muzik',
  'edebiyat',
  'kitap',
  'opera',
  'bale',
  'sanat',
  'film festival',
  'belgesel',
  'müze',
  'muze',
  'galeri',
  'roman',
  'şiir',
  'siir',
] as const

/** Keywords indicating nationwide urgency (not local traffic or sports). */
const NATIONAL_SCOPE_KEYWORDS = [
  'türkiye geneli',
  'turkiye geneli',
  'tüm türkiye',
  'tum turkiye',
  'tüm ülke',
  'tum ulke',
  'ulusal',
  'cumhurbaşkan',
  'cumhurbaskan',
  'tbmm',
  'meclis',
  'deprem',
  'felaket',
  'afet',
  'terör',
  'teror',
  'saldırı',
  'saldiri',
  'darbe',
  'olağanüstü',
  'olaaganustu',
  'acil durum',
  'can kaybı',
  'can kaybi',
  'patlama',
  'yangın',
  'yangin',
  'sel felaketi',
  'heyelan',
  'suikast',
  'assassination',
  'nationwide',
  'emergency',
] as const

const WORLD_CUP_FINAL_BREAKING = [
  'dünya kupası final',
  'dunya kupasi final',
  'world cup final',
] as const

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function containsKeyword(text: string, keywords: readonly string[]): boolean {
  const normalized = text.toLocaleLowerCase('tr-TR')
  const padded = ` ${normalized} `

  return keywords.some((kw) => {
    const term = kw.toLocaleLowerCase('tr-TR')
    if (term.length <= 4) {
      const re = new RegExp(`(?:^|[\\s,.;:!?()\\[\\]"'«»])${escapeRegex(term)}(?:$|[\\s,.;:!?()\\[\\]"'«»])`, 'i')
      return re.test(normalized)
    }
    return padded.includes(` ${term} `) || normalized.includes(term)
  })
}

function hasTechKeywords(text: string): boolean {
  return containsKeyword(text, TEKNOLOJI_KEYWORDS)
}

function hasSiyasetKeywords(text: string): boolean {
  return containsKeyword(text, SIYASET_KEYWORDS)
}

function hasEkonomiKeywords(text: string): boolean {
  return containsKeyword(text, EKONOMI_KEYWORDS)
}

function hasDunyaKeywords(text: string): boolean {
  return containsKeyword(text, DUNYA_KEYWORDS)
}

function hasSportsKeywords(text: string): boolean {
  return containsKeyword(text, SPOR_KEYWORDS)
}

function hasMagazinKeywords(text: string): boolean {
  return containsKeyword(text, MAGAZIN_KEYWORDS)
}

function hasKulturKeywords(text: string): boolean {
  return containsKeyword(text, KULTUR_KEYWORDS)
}

function hasNationalScopeKeywords(text: string): boolean {
  return containsKeyword(text, NATIONAL_SCOPE_KEYWORDS)
}
// Yerel-haber sinyalleri: belediye servisleri, ulaşım, yerel etkinlik
const YEREL_KEYWORDS = [
  'belediye', 'buyuksehir belediye', 'ilce belediye',
  'belediye baskani', 'belediye meclis', 'belediye otobus',
  'ucretsiz ulasim', 'ucretsiz otobus', 'toplu tasima',
  'eshot', 'ego otobus', 'su kesintisi', 'elektrik kesintisi',
  'park ve bahce', 'asfalt calısma', 'trafik duzenleme',
  'yerel secim', 'mahalle muhtarlık', 'kent donusum',
  'zabita', 'belde', 'koy muhtari', 'ilce', 'mahalle',
  // Ek yerel sinyaller
  'valilik', 'il mudurlugu', 'kaymakamlık', 'kaymakam',
  'il genel meclis', 'il baskani', 'il teşkilat',
  'spor merkezi', 'kulturpark', 'fuar alani',
  'trafik kazasi', 'yangin cikti', 'hırsız yakalandi',
  'uyusturucu operasyon', 'narkotik', 'gozaltı',
] as const

function hasYerelKeywords(text: string): boolean {
  const lower = text
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
  return YEREL_KEYWORDS.some(k => lower.includes(k))
}

const TURKISH_CITY_SLUGS = [
  'adana','adiyaman','afyon','agri','aksaray','amasya','ankara','antalya',
  'ardahan','artvin','aydin','balikesir','bartin','batman','bayburt','bilecik',
  'bingol','bitlis','bolu','burdur','bursa','canakkale','cankiri','corum',
  'denizli','diyarbakir','duzce','edirne','elazig','erzincan','erzurum',
  'eskisehir','gaziantep','giresun','gumushane','hakkari','hatay','igdir',
  'isparta','istanbul','izmir','kahramanmaras','karabuk','karaman','kars',
  'kastamonu','kayseri','kilis','kirikkale','kirklareli','kirsehir','kocaeli',
  'konya','kutahya','malatya','manisa','mardin','mersin','mugla','mus',
  'nevsehir','nigde','ordu','osmaniye','rize','sakarya','samsun','sanliurfa',
  'siirt','sinop','sirnak','sivas','tekirdag','tokat','trabzon','tunceli',
  'usak','van','yalova','yozgat','zonguldak',
] as const

function mentionsSingleCity(text: string): boolean {
  const lower = text
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's')
    .replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c')
  let count = 0
  for (const city of TURKISH_CITY_SLUGS) {
    const re = new RegExp(`(?<![a-z])${city}(?![a-z])`)
    if (re.test(lower)) {
      count++
      if (count >= 3) return false // 3+ il → ulusal haber
    }
  }
  return count >= 1 && count <= 2
}

function isWorldCupFinalNationalWin(text: string): boolean {
  if (!hasSportsKeywords(text)) return false
  if (!containsKeyword(text, WORLD_CUP_FINAL_BREAKING)) return false
  const lower = text.toLocaleLowerCase('tr-TR')
  return lower.includes('milli takım') || lower.includes('milli takim') || lower.includes('türkiye')
}

/** Spor alt kategorileri kümesi — birden fazla fonksiyon kullanır */
export const SPOR_SUBS = new Set(['futbol', 'basketbol', 'voleybol', 'hentbol', 'atletizm', 'gures'])

export function normalizeNewsroomCategory(raw?: string): string {
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
  if (VALID_IDS.has(slug)) return slug

  const byName = Object.entries(NEWSROOM_CATEGORIES).find(
    ([, name]) => name.toLowerCase() === value
  )
  if (byName) return byName[0]

  return 'gundem'
}

/**
 * Resolves the final category for a news item.
 *
 * Priority:
 * 1. Hard editor-type locks (local → yerel-haber, trend → trend, influencer → influencer)
 * 2. If AI identified a specific non-generic category AND it differs from the
 *    source-level hint, trust the AI (content-first principle).
 * 3. Source-level forced category as hint (used when AI falls back to 'gundem').
 *
 * This prevents magazin/spor/gastronomi sources from forcing category on
 * political, world, or economy articles that were correctly identified by AI.
 */
export function resolveCategoryForEditor(
  aiCategoryId: string,
  editorType: NewsroomEditorType,
  forcedCategoryId?: string
): string {
  // Hard locks — editor type always wins for these
  if (editorType === 'local') return 'yerel-haber'
  if (editorType === 'trend') {
    // AI'ın belirlediği gerçek kategoriyi kullan (futbol, magazin, vb.)
    // forcedCategoryId yoksa veya 'trend' ise fallback olarak 'trend' kategorisine düş
    const forced = forcedCategoryId?.trim()
    if (forced && forced !== 'trend' && forced !== 'trending') return forced
    return 'trend'
  }
  if (editorType === 'influencer') return 'influencer'

  const normalizedAi = normalizeNewsroomCategory(aiCategoryId)
  const normalizedForced = forcedCategoryId?.trim()
    ? normalizeNewsroomCategory(forcedCategoryId)
    : null

  if (!normalizedForced) return normalizedAi

  // AI fell back to generic → apply source hint, ANCAK spor alt kategorisi ise dikkatli ol.
  // Örnek: YKS haberi basketbol kaynağından geldi → AI "gundem" dedi →
  // normalizedForced="basketbol" → YKS haberi basketbol'a düşüyor. YANLIŞ.
  // Spor alt kategorisi ise AI'nın gundem kararına güven (validate aşaması düzeltir).
  if (normalizedAi === 'gundem') {
    const isForcedSportSub = SPOR_SUBS.has(normalizedForced)
    if (isForcedSportSub) return normalizedAi  // gündem olarak bırak, validate düzeltir
    return normalizedForced
  }

  // AI agrees with source hint → use it (may be a subcategory the hint targets)
  if (normalizedAi === normalizedForced) return normalizedForced

  // AI found a specific non-generic category that differs from the source hint.
  // Trust AI content analysis over the source-origin hint.
  // Exception: forced subcategories that belong to the same parent as the AI category
  // (e.g., AI says 'spor', forced says 'futbol' → prefer the more specific 'futbol').
  const KULTUR_SUBS = new Set(['sinema', 'tiyatro', 'konser', 'festival'])
  const isAiSpor = normalizedAi === 'spor' || SPOR_SUBS.has(normalizedAi)
  const isForcedSpor = normalizedForced === 'spor' || SPOR_SUBS.has(normalizedForced)
  const isAiKultur = normalizedAi === 'kultur' || KULTUR_SUBS.has(normalizedAi)
  const isForcedKultur = normalizedForced === 'kultur' || KULTUR_SUBS.has(normalizedForced)

  // Both in the same family → prefer the more specific forced subcategory
  if (isAiSpor && isForcedSpor) return normalizedForced
  if (isAiKultur && isForcedKultur) return normalizedForced

  // AI and source disagree on different domains → trust AI
  return normalizedAi
}

export interface CategoryValidationInput {
  aiCategoryId: string
  categoryConfidence?: number
  aiIsBreaking?: boolean
  title: string
  body: string
  editorType?: NewsroomEditorType
}

export interface CategoryValidationResult {
  categoryId: string
  categoryConfidence: number
  isBreaking: boolean
  /** Human-readable override reasons (logging / admin). */
  overrides: string[]
}

/**
 * Post-AI heuristic validation — corrects misclassified sports, culture, and breaking news.
 */
export function validateCategoryClassification(
  input: CategoryValidationInput
): CategoryValidationResult {
  const text = `${input.title} ${input.body}`.trim()
  const overrides: string[] = []
  let categoryId = normalizeNewsroomCategory(input.aiCategoryId)

  // ── Hard-locked categories: trend / influencer editörleri kendi kategorilerine kilitlidir.
  // Keyword heuristik override'ları (spor, magazin, teknoloji vb.) bu kategorilere uygulanmaz.
  if (
    categoryId === 'trend' ||
    categoryId === 'influencer' ||
    input.editorType === 'trend' ||
    input.editorType === 'influencer'
  ) {
    return {
      categoryId: input.editorType === 'trend' ? 'trend' : input.editorType === 'influencer' ? 'influencer' : categoryId,
      categoryConfidence: Math.min(100, Math.max(0, input.categoryConfidence ?? 80)),
      isBreaking: false, // trend/influencer haberleri asla son-dakika değil
      overrides: [],
    }
  }
  let categoryConfidence = Math.min(100, Math.max(0, input.categoryConfidence ?? 70))
  let isBreaking = Boolean(input.aiIsBreaking)

  const sports = hasSportsKeywords(text)
  const magazin = hasMagazinKeywords(text)
  const kultur = hasKulturKeywords(text)
  const tech = hasTechKeywords(text)
  const siyaset = hasSiyasetKeywords(text)
  const ekonomi = hasEkonomiKeywords(text)
  const dunya = hasDunyaKeywords(text)
  const bilim = hasBilimKeywords(text)
  const gastronomi = hasGastronomiKeywords(text)
  const otomobil = hasOtomobilKeywords(text)
  const nationalScope = hasNationalScopeKeywords(text)
  const worldCupFinal = isWorldCupFinalNationalWin(text)

  // ── EN YÜKSEK ÖNCELİK: "Spor kaynaklı ama spor haberi değil" kurtarma ──────
  // Sorun: spor gazeteleri / basketbol-voleybol kaynakları siyasi/eğitim/dünya
  // haberlerini de yayınlar. forcedCategoryId='basketbol' olsa bile içerikte
  // HIÇBIR spor kelimesi yoksa gerçek kategoriye taşı.
  //
  // KURAL: spor alt kategorileri dahil (futbol, basketbol, voleybol, hentbol...) —
  // metinde spor sinyali yoksa kaynak zorlaması GEÇERSİZ.
  const isAnySportCategory = categoryId === 'spor' || SPOR_SUBS.has(categoryId)
  if (isAnySportCategory && !sports) {
    const prevCat = categoryId
    if (siyaset) {
      overrides.push(`${prevCat}-source ama siyaset-keywords → siyaset`)
      categoryId = 'siyaset'
      categoryConfidence = Math.max(categoryConfidence, 90)
    } else if (dunya) {
      overrides.push(`${prevCat}-source ama dunya-keywords → dunya`)
      categoryId = 'dunya'
      categoryConfidence = Math.max(categoryConfidence, 88)
    } else if (ekonomi) {
      overrides.push(`${prevCat}-source ama ekonomi-keywords → ekonomi`)
      categoryId = 'ekonomi'
      categoryConfidence = Math.max(categoryConfidence, 85)
    } else if (bilim) {
      overrides.push(`${prevCat}-source ama bilim-keywords → bilim`)
      categoryId = 'bilim'
      categoryConfidence = Math.max(categoryConfidence, 85)
    } else if (otomobil) {
      overrides.push(`${prevCat}-source ama otomobil-keywords → otomobil`)
      categoryId = 'otomobil'
      categoryConfidence = Math.max(categoryConfidence, 84)
    } else if (tech) {
      overrides.push(`${prevCat}-source ama tech-keywords → teknoloji`)
      categoryId = 'teknoloji'
      categoryConfidence = Math.max(categoryConfidence, 83)
    } else if (magazin) {
      overrides.push(`${prevCat}-source ama magazin-keywords → magazin`)
      categoryId = 'magazin'
      categoryConfidence = Math.max(categoryConfidence, 82)
    } else if (nationalScope) {
      overrides.push(`${prevCat}-source ama ulusal-kriz → gundem`)
      categoryId = 'gundem'
      categoryConfidence = Math.max(categoryConfidence, 88)
    } else {
      // Spor kelimesi yok, başka güçlü sinyal de yok → gündem
      overrides.push(`${prevCat}-source ama içerikte spor yok → gundem`)
      categoryId = 'gundem'
      categoryConfidence = Math.max(categoryConfidence, 70)
    }
  }

  // ── Afet/Deprem özel override: siyaset kategorisine yanlış düşen doğal afet haberlerini kurtar.
  // Sorun: "Deprem sonrası Erdoğan bölgeyi ziyaret etti" → AI siyaset seçiyor.
  // Çözüm: içerikte somut afet kelimesi varsa VE seçim/parti gibi gerçek siyasi sinyal yoksa → gündem.
  const DISASTER_TERMS = ['deprem', 'enkaz', 'arama kurtarma', 'afad', 'büyük yangın', 'sel felaketi', 'heyelan', 'toprak kayması', 'tsunami', 'can kaybı', 'hayatını kaybetti', 'yaralı sayısı', 'patlama', 'göçük']
  const PARTISAN_TERMS = ['seçim', 'secim', 'sandık', 'oy oranı', 'akp', 'chp', 'mhp', 'hdp', 'dem parti', 'iyi parti', 'kurultay', 'referandum', 'muhalefet', 'iktidar koalisyon', 'parti genel başkanı']
  const hasDisasterTerm = DISASTER_TERMS.some(t => text.toLocaleLowerCase('tr-TR').includes(t))
  const hasPartisanTerm = PARTISAN_TERMS.some(t => text.toLocaleLowerCase('tr-TR').includes(t))

  if (hasDisasterTerm && !hasPartisanTerm && categoryId === 'siyaset') {
    overrides.push(`afet-keywords → gundem (was siyaset, no partisan signal)`)
    categoryId = 'gundem'
    categoryConfidence = Math.max(categoryConfidence, 92)
  }

  // ── Ulusal kriz / afet override — en yüksek öncelik (deprem, yangın, patlama vs.)
  // Teknoloji/ekonomi/kültür gibi kategorilere yanlış düşen afet haberlerini gündem'e çek.
  if (
    nationalScope &&
    !sports &&
    !siyaset &&
    ['teknoloji', 'ekonomi', 'kultur', 'magazin', 'bilim'].includes(categoryId)
  ) {
    overrides.push(`national-scope → gundem (was ${categoryId})`)
    categoryId = 'gundem'
    categoryConfidence = Math.max(categoryConfidence, 90)
  }

  // ── Teknoloji override: SADECE asıl sinyal teknoloji olduğunda uygula.
  // Trend editörü sosyal medya bölümü yazar → teknoloji'ye çekilmesin.
  // Ulusal kriz (deprem vb.) → teknoloji'ye çekilmesin.
  // Siyaset / spor / yerel → teknoloji'ye çekilmesin.
  if (
    tech &&
    !sports &&
    !nationalScope &&
    !siyaset &&
    categoryId !== 'teknoloji' &&
    categoryId !== 'trend' &&
    categoryId !== 'yerel-haber' &&
    categoryId !== 'spor' &&
    categoryId !== 'siyaset' &&
    categoryId !== 'son-dakika'
  ) {
    overrides.push(`tech-keywords → teknoloji (was ${categoryId})`)
    categoryId = 'teknoloji'
    categoryConfidence = Math.max(categoryConfidence, 85)
  }

  // ── Siyaset override: political figures/events wrongly bucketed as ekonomi/gundem
  if (siyaset && !sports && !tech && categoryId === 'ekonomi') {
    overrides.push(`siyaset-keywords → siyaset (was ekonomi)`)
    categoryId = 'siyaset'
    categoryConfidence = Math.max(categoryConfidence, 82)
  }

  // ── Ekonomi override: clear financial signal but AI picked gundem
  if (ekonomi && !sports && !tech && !siyaset && categoryId === 'gundem') {
    overrides.push(`ekonomi-keywords → ekonomi (was gundem)`)
    categoryId = 'ekonomi'
    categoryConfidence = Math.max(categoryConfidence, 80)
  }

  // ── Bilim override: science/UFO/space content misclassified as gundem or spor
  if (
    bilim &&
    !sports &&
    !nationalScope &&
    !siyaset &&
    !ekonomi &&
    (categoryId === 'gundem' || categoryId === 'spor')
  ) {
    overrides.push(`bilim-keywords → bilim (was ${categoryId})`)
    categoryId = 'bilim'
    categoryConfidence = Math.max(categoryConfidence, 83)
  }

  // ── Magazin override: TV/celeb/dizi news classified as gundem by AI
  if (
    magazin &&
    !sports &&
    !nationalScope &&
    !siyaset &&
    !ekonomi &&
    (categoryId === 'gundem' || categoryId === 'teknoloji')
  ) {
    overrides.push(`magazin-keywords → magazin (was ${categoryId})`)
    categoryId = 'magazin'
    categoryConfidence = Math.max(categoryConfidence, 82)
  }

  // ── Yerel-haber override: belediye/municipal keywords + single city → yerel-haber
  // Prevents local municipal news from polluting the main gündem/siyaset feed.
  // Genişletildi: AI siyaset de dönse belediye haberi tek şehirle → yerel-haber.
  const YEREL_OVERRIDE_CATEGORIES = new Set(['gundem', 'siyaset', 'spor', 'ekonomi', 'kultur'])
  if (
    hasYerelKeywords(text) &&
    mentionsSingleCity(text) &&
    !nationalScope &&
    YEREL_OVERRIDE_CATEGORIES.has(categoryId)
  ) {
    overrides.push(`yerel-keywords + single-city → yerel-haber (was ${categoryId})`)
    categoryId = 'yerel-haber'
    categoryConfidence = Math.max(categoryConfidence, 85)
  }

  if (sports) {
    // Alt dal tespiti: futbol > basketbol > voleybol > genel spor
    const sportSub = detectSportSubcategory(text)
    const targetCat = sportSub ?? 'spor'
    const isAlreadySportsFamily = categoryId === 'spor' || SPOR_SUBS.has(categoryId)

    if (!isAlreadySportsFamily) {
      overrides.push(`spor-keywords → ${targetCat} (was ${categoryId})`)
      categoryId = targetCat
      categoryConfidence = Math.max(categoryConfidence, 88)
    } else if (categoryId === 'spor' && sportSub) {
      // Genel 'spor' idi ama alt dal tespit edilebildi → daha spesifik kategoriye yükselt
      overrides.push(`spor → ${sportSub} (sub-category detected)`)
      categoryId = sportSub
      categoryConfidence = Math.max(categoryConfidence, 88)
    }
    // Eğer zaten bir alt dal ise (futbol, basketbol...) → dokunma

    if (isBreaking && !worldCupFinal && !nationalScope) {
      overrides.push('clear isBreaking for sports (non-national emergency)')
      isBreaking = false
    }
  }

  if (categoryId === 'kultur' && sports) {
    const sportSub = detectSportSubcategory(text)
    overrides.push(`kultur+spor-keywords → ${sportSub ?? 'spor'}`)
    categoryId = sportSub ?? 'spor'
    isBreaking = worldCupFinal && nationalScope
  }

  // ── Gastronomi override: yemek/restoran/mutfak haberleri kültür'e gitmesin ──
  if (
    gastronomi &&
    !sports &&
    !nationalScope &&
    !siyaset &&
    (categoryId === 'kultur' || categoryId === 'gundem' || categoryId === 'magazin')
  ) {
    overrides.push(`gastronomi-keywords → gastronomi (was ${categoryId})`)
    categoryId = 'gastronomi'
    categoryConfidence = Math.max(categoryConfidence, 84)
  }

  // ── son-dakika içine sızan uygunsuz kategorileri geri çek ─────────────────
  // Kural: son-dakika SADECE ulusal/küresel kriz. Yerel, spor, magazin, kültür
  // ne kadar "acil" görünürse görünsün son-dakika olamaz.
  if (categoryId === 'son-dakika') {
    if (sports && !worldCupFinal) {
      overrides.push('son-dakika+sports → spor')
      categoryId = 'spor'
      isBreaking = false
    } else if (magazin && !nationalScope) {
      overrides.push('son-dakika+magazin → magazin')
      categoryId = 'magazin'
      isBreaking = false
    } else if (kultur && !nationalScope) {
      overrides.push('son-dakika+kultur → kultur')
      categoryId = 'kultur'
      isBreaking = false
    } else if (gastronomi && !nationalScope) {
      overrides.push('son-dakika+gastronomi → gastronomi')
      categoryId = 'gastronomi'
      isBreaking = false
    } else if (!nationalScope && (hasYerelKeywords(text) || mentionsSingleCity(text))) {
      // Ulusal kapsam yoksa VE yerel sinyal varsa → yerel-haber
      overrides.push('son-dakika+yerel-sinyal+ulusal-kapsam-yok → yerel-haber')
      categoryId = 'yerel-haber'
      isBreaking = false
    } else if (!nationalScope && input.editorType !== 'breaking' && !worldCupFinal) {
      // Ulusal kapsam yok, breaking editörü değil → gündem
      overrides.push('son-dakika+ulusal-kapsam-yok → gundem')
      categoryId = 'gundem'
      isBreaking = false
    }
  }

  // ── yerel-haber hiçbir zaman son-dakika olamaz ───────────────────────────
  // Yerel yangın/kaza/operasyon ne kadar dramatik olursa olsun isBreaking=false.
  if (categoryId === 'yerel-haber' && isBreaking) {
    overrides.push('isBreaking cleared — yerel-haber asla son-dakika olamaz')
    isBreaking = false
  }

  // ── Kutlama / tören / özel gün içeriği son-dakika olamaz ─────────────────
  // "Babalar Günü kutlamaları", "Mezuniyet töreni" vb. içerikler acil keyword
  // içermese de breaking news editörünün kaynaklarından geldiğinde son-dakika
  // statüsü alabiliyordu. Bu guard o boşluğu kapatır.
  const CELEBRATION_TERMS = [
    'kutlama', 'kutlandı', 'kutluyor', 'kutladı', 'kutlayacak',
    'babalar günü', 'anneler günü', 'sevgililer günü',
    'öğretmenler günü', 'öğretmenlerin günü',
    'çocuk bayramı kutl', 'gençlik bayramı kutl',
    'anma töreni', 'anma etkinliği',
    'mezuniyet töreni', 'mezuniyet tören',
    'açılış töreni', 'şenlik başladı', 'şenlik düzenlendi',
    'festival başladı', 'tören düzenlendi', 'resepsiyon düzenlendi',
    'sergi açıldı', 'sergi açılışı', 'kariyer günü', 'özel gün',
  ]
  const hasCelebrationContent = CELEBRATION_TERMS.some(
    (t) => text.toLocaleLowerCase('tr-TR').includes(t)
  )
  // Gerçek bir afet/acil durum varsa kutlama filtresini bypass et
  // (örn: Cumhuriyet Bayramı töreninde patlama haberi)
  if (hasCelebrationContent && isBreaking && !hasDisasterTerm) {
    overrides.push('isBreaking cleared — kutlama/tören/özel gün içeriği son-dakika olamaz')
    isBreaking = false
    if (categoryId === 'son-dakika') {
      overrides.push('son-dakika → gundem (kutlama içeriği)')
      categoryId = 'gundem'
    }
  }

  // Breaking editor pre-scores urgency signals — trust them without requiring nationalScope
  const isBreakingEditor = input.editorType === 'breaking'

  if (isBreaking) {
    // categoryConfidence > 90 artık tek başına yeterli değil.
    // Yerel haberlerin yüksek confidence ile son-dakikaya sızmasını önler.
    const allowedBreaking = isBreakingEditor || worldCupFinal || nationalScope
    if (!allowedBreaking) {
      overrides.push('isBreaking cleared — no national scope')
      isBreaking = false
      if (categoryId === 'son-dakika') {
        const fallback = sports ? 'spor' : magazin ? 'magazin' : 'gundem'
        overrides.push(`son-dakika → ${fallback} (no national scope)`)
        categoryId = fallback
      }
    }
  }

  if (isBreaking && categoryId === 'spor' && !worldCupFinal) {
    overrides.push('isBreaking cleared for spor')
    isBreaking = false
  }

  if (isBreaking && (categoryId === 'magazin' || categoryId === 'kultur' || categoryId === 'gastronomi')) {
    overrides.push(`isBreaking cleared for ${categoryId}`)
    isBreaking = false
  }

  if (isBreaking && categoryId !== 'son-dakika') {
    if (nationalScope || isBreakingEditor) {
      // Yerel içerik son-dakika olamaz — breaking editör bypass'ı da geçersiz.
      const isLocalContent = !nationalScope && (hasYerelKeywords(text) || mentionsSingleCity(text))
      if (isLocalContent) {
        overrides.push('isBreaking + yerel-içerik → yerel-haber (son-dakika engellendi)')
        categoryId = 'yerel-haber'
        isBreaking = false
      } else {
        categoryId = 'son-dakika'
        categoryConfidence = Math.max(categoryConfidence, 92)
        overrides.push(`isBreaking → son-dakika (${isBreakingEditor ? 'breaking editor' : 'national scope'})`)
      }
    }
  }

  return {
    categoryId,
    categoryConfidence,
    isBreaking,
    overrides,
  }
}

export const categoryEngine = {
  normalize: normalizeNewsroomCategory,
  resolve: resolveCategoryForEditor,
  validate: validateCategoryClassification,
  categories: NEWSROOM_CATEGORIES,
}
