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
}

/** Extended categories beyond aiNewsEditor defaults. */
export const NEWSROOM_CATEGORIES: Record<string, string> = {
  ...AI_NEWS_CATEGORIES,
  trend: 'Trend',
  influencer: 'Influencer',
  'yerel-haber': 'Yerel Haber',
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
  'bitcoin', 'kripto para', 'borsa endeksi', 'bist',
  'hisse senedi', 'şirket kârı', 'şirket zararı', 'halka arz',
  'vergi düzenlemesi', 'sgk primi', 'asgari ücret',
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
] as const

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

function isWorldCupFinalNationalWin(text: string): boolean {
  if (!hasSportsKeywords(text)) return false
  if (!containsKeyword(text, WORLD_CUP_FINAL_BREAKING)) return false
  const lower = text.toLocaleLowerCase('tr-TR')
  return lower.includes('milli takım') || lower.includes('milli takim') || lower.includes('türkiye')
}

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

export function resolveCategoryForEditor(
  aiCategoryId: string,
  editorType: NewsroomEditorType,
  forcedCategoryId?: string
): string {
  if (forcedCategoryId?.trim()) {
    return normalizeNewsroomCategory(forcedCategoryId)
  }

  if (editorType === 'local') return 'yerel-haber'
  if (editorType === 'trend') return 'trend'
  if (editorType === 'influencer') return 'influencer'

  return normalizeNewsroomCategory(aiCategoryId)
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
  let categoryConfidence = Math.min(100, Math.max(0, input.categoryConfidence ?? 70))
  let isBreaking = Boolean(input.aiIsBreaking)

  const sports = hasSportsKeywords(text)
  const magazin = hasMagazinKeywords(text)
  const kultur = hasKulturKeywords(text)
  const tech = hasTechKeywords(text)
  const siyaset = hasSiyasetKeywords(text)
  const ekonomi = hasEkonomiKeywords(text)
  const dunya = hasDunyaKeywords(text)
  const nationalScope = hasNationalScopeKeywords(text)
  const worldCupFinal = isWorldCupFinalNationalWin(text)

  // ── EN YÜKSEK ÖNCELİK: "Spor kaynaklı ama spor haberi değil" kurtarma ──────
  // Sorun: spor gazeteleri siyasi/dünya haberlerini de yayınlar.
  // forcedCategoryId='spor' olsa bile içerik spor kelimesi taşımıyorsa
  // gerçek kategoriye taşı.
  if (categoryId === 'spor' && !sports) {
    if (siyaset) {
      overrides.push('spor-source ama siyaset-keywords → siyaset')
      categoryId = 'siyaset'
      categoryConfidence = Math.max(categoryConfidence, 90)
    } else if (dunya) {
      overrides.push('spor-source ama dunya-keywords → dunya')
      categoryId = 'dunya'
      categoryConfidence = Math.max(categoryConfidence, 88)
    } else if (ekonomi) {
      overrides.push('spor-source ama ekonomi-keywords → ekonomi')
      categoryId = 'ekonomi'
      categoryConfidence = Math.max(categoryConfidence, 85)
    } else if (tech) {
      overrides.push('spor-source ama tech-keywords → teknoloji')
      categoryId = 'teknoloji'
      categoryConfidence = Math.max(categoryConfidence, 83)
    } else if (nationalScope) {
      overrides.push('spor-source ama ulusal-kriz → gundem')
      categoryId = 'gundem'
      categoryConfidence = Math.max(categoryConfidence, 88)
    } else {
      // Spor kelimesi yok, başka sinyal de yok → gündem
      overrides.push('spor-source ama içerikte spor yok → gundem')
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
    input.editorType !== 'trend' &&
    input.editorType !== 'local' &&
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

  if (sports) {
    if (categoryId !== 'spor') {
      overrides.push(`spor-keywords → spor (was ${categoryId})`)
      categoryId = 'spor'
      categoryConfidence = Math.max(categoryConfidence, 88)
    }
    if (isBreaking && !worldCupFinal && !nationalScope) {
      overrides.push('clear isBreaking for sports (non-national emergency)')
      isBreaking = false
    }
  }

  if (categoryId === 'kultur' && sports) {
    overrides.push('kultur+spor-keywords → spor')
    categoryId = 'spor'
    isBreaking = worldCupFinal && nationalScope
  }

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
    }
  }

  // Breaking editor pre-scores urgency signals — trust them without requiring nationalScope
  const isBreakingEditor = input.editorType === 'breaking'

  if (isBreaking) {
    const allowedBreaking =
      isBreakingEditor || worldCupFinal || nationalScope || categoryConfidence > 90 || categoryId === 'son-dakika'
    if (!allowedBreaking) {
      overrides.push('isBreaking cleared — no national scope / low confidence')
      isBreaking = false
      if (categoryId === 'son-dakika') {
        categoryId = sports ? 'spor' : magazin ? 'magazin' : 'gundem'
      }
    }
  }

  if (isBreaking && categoryId === 'spor' && !worldCupFinal) {
    overrides.push('isBreaking cleared for spor')
    isBreaking = false
  }

  if (isBreaking && (categoryId === 'magazin' || categoryId === 'kultur')) {
    overrides.push(`isBreaking cleared for ${categoryId}`)
    isBreaking = false
  }

  if (isBreaking && categoryId !== 'son-dakika') {
    if (nationalScope || isBreakingEditor) {
      categoryId = 'son-dakika'
      categoryConfidence = Math.max(categoryConfidence, 92)
      overrides.push(`isBreaking → son-dakika (${isBreakingEditor ? 'breaking editor' : 'national scope'})`)
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
