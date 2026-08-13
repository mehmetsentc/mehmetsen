import {
  YEREL_HABER_CATEGORY_ID,
  isYerelCategoryTree,
  mapNationalCategoryToYerelSubcategory,
  shouldLocalizeCategory,
} from '@/constants/config'

export interface NationalLocalDualRouting {
  nationalCategoryId: string
  yerelTag: string
}

/** Merge yerel subcategory tag without duplicates (case-insensitive). */
export function mergeNationalLocalTags(
  existingTags: string[] | undefined,
  yerelTag: string,
): string[] {
  const tags = [...(existingTags ?? [])]
  const normalized = yerelTag.trim().toLowerCase()
  if (!normalized) return tags
  const hasTag = tags.some((t) => t.trim().toLowerCase() === normalized)
  if (!hasTag) tags.push(yerelTag)
  return tags
}

function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
}

/** Ulusal / genel ilgi — şehir geçse bile ulusal kategori kalmalı. */
const NATIONAL_INTEREST_SIGNALS = [
  'turkiye geneli',
  'tum turkiye',
  'tum ulke',
  'ulke capinda',
  'ulusal olcek',
  'ulusal politika',
  'bakanlik',
  'saglik bakanligi',
  'cevre bakanligi',
  'ekonomi bakanligi',
  'bakan acikladi',
  'bakan aciklamasi',
  'cumhurbaskani',
  'tbmm',
  'meclis kabul',
  'tcmb',
  'merkez bankasi',
  'bist',
  'borsa istanbul',
  'asgari ucret',
  'yonetmelik',
  'kanun teklifi',
  'resmi gazete',
  'who ',
  'dunya saglik',
  'kuresel',
  'uluslararasi piyasa',
] as const

/** Tek şehir yerel işleri — konu emlak/sağlık/çevre olsa bile yerel-*. */
const LOCAL_SCOPE_SIGNALS = [
  'belediye',
  'buyuksehir',
  'valilik',
  'vali ',
  'kaymakam',
  'ilce',
  'mahalle',
  'muhtar',
  'zabita',
  'il mudurlugu',
  'il milli egitim',
  'il saglik',
  'kent mobilya',
  'yoresel',
  'mahalli',
  'seferberlik',
  'temizlik calismasi',
  'kati atik',
  'denize giris yasagi',
  'su kesintisi',
  'elektrik kesintisi',
  'imar plani',
  'askiya alindi',
] as const

/**
 * Haber öncelikle tek şehrin yerel işi mi?
 * true → categoryId yerel-* olmalı (citySlug korunur).
 * false → ulusal kategori + citySlug (konum yalnızca geçiyor) OK.
 */
export function isLocalPrimaryScope(
  title: string,
  body = '',
  citySlug?: string | null,
): boolean {
  if (!citySlug?.trim()) return false

  const titleNorm = normalizeTr(title)
  const bodyNorm = normalizeTr(body.slice(0, 1200))
  const combined = `${titleNorm} ${bodyNorm}`
  const slug = normalizeTr(citySlug.trim())

  if (NATIONAL_INTEREST_SIGNALS.some((s) => combined.includes(s))) {
    return false
  }

  // 3+ il adı → çok şehir / ulusal çerçeve
  const cityHits = [
    'adana', 'ankara', 'antalya', 'bursa', 'istanbul', 'izmir', 'konya',
    'gaziantep', 'mersin', 'kayseri', 'samsun', 'trabzon', 'van',
    'yalova', 'yozgat', 'canakkale', 'balikesir', 'manisa', 'aydin', 'mugla',
    'diyarbakir', 'sanliurfa', 'hatay', 'malatya', 'erzurum', 'eskisehir',
    'denizli', 'sakarya', 'kocaeli', 'tekirdag', 'ordu', 'afyon',
  ]
  let distinctCities = 0
  for (const c of cityHits) {
    if (new RegExp(`(?<![a-z])${c}(?![a-z])`).test(combined)) {
      distinctCities += 1
      if (distinctCities >= 3) return false
    }
  }

  // Başlıkta şehir / göl / il ifadesi → yerel birincil (Van'da konut, Van Gölü…)
  const cityInTitle =
    new RegExp(`(?<![a-z])${slug}(?![a-z])`).test(titleNorm) ||
    (slug === 'van' && /\bvan\s*gol/.test(titleNorm))

  const localSignal = LOCAL_SCOPE_SIGNALS.some((s) => combined.includes(s))

  if (cityInTitle) return true
  if (localSignal) return true

  return false
}

/**
 * Yerel birincil haberlerde ulusal topical id → yerel-* alt kategori.
 * Ulusal birincil + konum → categoryId değişmez.
 */
export function resolveCategoryForLocalVsNationalScope(
  categoryId: string,
  title: string,
  body: string,
  citySlug?: string | null,
): string {
  const cat = categoryId?.trim().toLowerCase() ?? ''
  if (!cat || !citySlug?.trim()) return cat

  // Gastronomi stays national — dish/city name in a recipe must not become yerel-gastronomi.
  if (cat === 'gastronomi' || cat === 'yemek' || cat === 'tarif' || cat === 'food') {
    return cat === 'gastronomi' ? cat : 'gastronomi'
  }

  if (isYerelCategoryTree(cat) && cat !== YEREL_HABER_CATEGORY_ID) {
    return cat
  }

  if (!isLocalPrimaryScope(title, body, citySlug)) {
    return cat
  }

  if (cat === YEREL_HABER_CATEGORY_ID) {
    return YEREL_HABER_CATEGORY_ID
  }

  return mapNationalCategoryToYerelSubcategory(cat) ?? YEREL_HABER_CATEGORY_ID
}

/**
 * Ulusal birincil + citySlug → categoryId ulusal kalır, yerel etiket eklenir
 * (şehir feed / etiket). Yerel birincil yerel-* categoryId ASLA ulusala çevrilmez.
 *
 * Önceki davranış yerel-* → ulusal remapi CMS'te Emlak/Sağlık/Çevre gösteriyordu;
 * artık yerel-* korunur.
 */
export function resolveNationalLocalDualRouting(
  categoryId: string,
  citySlug?: string | null,
  articleIsAbroad = false,
): NationalLocalDualRouting | null {
  if (articleIsAbroad || !citySlug?.trim()) return null

  const cat = categoryId?.trim().toLowerCase() ?? ''
  if (!cat || cat === YEREL_HABER_CATEGORY_ID) return null

  // Yerel ağaç: categoryId'yi ulusala çevirme — CMS ve şehir sayfaları yerel-* görsün
  if (isYerelCategoryTree(cat)) return null

  if (!shouldLocalizeCategory(cat, citySlug)) return null

  const yerelTag = mapNationalCategoryToYerelSubcategory(cat)
  if (!yerelTag || yerelTag === YEREL_HABER_CATEGORY_ID) return null

  return { nationalCategoryId: cat, yerelTag }
}

/** Normalize category + tags for manual queue publish / admin edits. */
export function normalizePublishedLocalCategory(
  categoryId: string,
  citySlug?: string | null,
  tags: string[] = [],
  opts?: { title?: string; body?: string },
): { categoryId: string; tags: string[] } {
  let cat = categoryId.trim()

  if (opts?.title && citySlug) {
    cat = resolveCategoryForLocalVsNationalScope(
      cat,
      opts.title,
      opts.body ?? '',
      citySlug,
    )
  }

  const routing = resolveNationalLocalDualRouting(cat, citySlug)
  if (!routing) return { categoryId: cat, tags }
  return {
    categoryId: routing.nationalCategoryId,
    tags: mergeNationalLocalTags(tags, routing.yerelTag),
  }
}
