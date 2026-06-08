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
  const nationalScope = hasNationalScopeKeywords(text)
  const worldCupFinal = isWorldCupFinalNationalWin(text)

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

  if (isBreaking) {
    const allowedBreaking =
      worldCupFinal || nationalScope || categoryConfidence > 90 || categoryId === 'son-dakika'
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

  if (isBreaking && categoryId !== 'son-dakika' && nationalScope) {
    categoryId = 'son-dakika'
    categoryConfidence = Math.max(categoryConfidence, 92)
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
