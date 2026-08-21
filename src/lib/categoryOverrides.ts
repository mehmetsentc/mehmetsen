/**
 * Hard category overrides when AI / heuristics pick a parent or wrong bucket.
 * Astrology is a Yaşam child — burç content must never stay on `yasam`.
 */

/**
 * Kategoriler ki asla astroloji'ye çevrilmemeli.
 * Örn: "boğa piyasası" (bull market) borsa haberi ama "boğa" kelimesi
 * zodiac sinyali olarak algılanıp astroloji'ye düşüyordu.
 */
const NON_ASTROLOGY_CATEGORIES = new Set([
  'ekonomi', 'borsa', 'kripto', 'finans-piyasa', 'emlak-konut', 'enerji', 'is-kariyer',
  'siyaset', 'son-dakika', 'gundem', 'dunya', 'kibris-haberleri', 'yerel-haber',
  'teknoloji', 'saglik', 'bilim', 'egitim', 'cevre-iklim', 'din-inanc',
  'spor', 'futbol', 'basketbol', 'voleybol', 'hentbol', 'atletizm', 'gures', 'dunya-kupasi-2026',
  'magazin', 'kultur', 'sinema', 'tiyatro', 'konser', 'festival',
  'gastronomi', 'otomobil', 'meteoroloji', 'turizm', 'gezi', 'tarih', 'asayis',
  'moda', 'anne-cocuk', 'dekorasyon', 'iliskiler', 'oyun-espor',
])

/** MasterChef Türkiye / reality TV — asla dünya kategorisine düşmesin. */
const MASTERCHEF_TV =
  /master\s*chef|masterchef/i
const TR_TV_COMPETITION =
  /dokunulmazl[ıi]k|eleme\s+aday|k[ıi]rm[ıi]z[ıi]\s+tak[ıi]m|mavi\s+tak[ıi]m|yar[ıi][şs]mac[ıi]/i

/**
 * Birincil astroloji sinyali — bunlardan biri varsa kesinlikle astroloji içeriği.
 * "burç", "astroloji", "horoscope", "retrosu", "zodyak" gibi açık sinyaller.
 */
const ASTROLOGY_ANCHOR =
  /astroloji|astrology|horoscope|burçlar?|günlük\s+burç|haftalık\s+burç|aylık\s+burç|yıllık\s+burç|retrosu|retrograde|zodiac|zodyak/i

/**
 * Zodiac işareti + "burcu/yorumu/rasali" kombinasyonu — burç bağlamı zorunlu.
 * "boğa" veya "yay" tek başına yetmez; "boğa burcu", "yay yorumu" gibi
 * bağlamsal kombinasyon gerekiyor.
 * Bu sayede "boğa piyasası", "aslan payı", "yay çekti" gibi finansal/gündelik
 * ifadeler astroloji olarak sınıflandırılmıyor.
 */
const ZODIAC_IN_CONTEXT =
  /\b(koç|boğa|ikizler|yengeç|aslan|başak|terazi|akrep|yay|oğlak|kova|balık)\s+(burcu?|yorumu?|rasali|transiti|etkisi|güne?|haftay?a|aya?)\b|\bburc\w*\s+(koç|boğa|ikizler|yengeç|aslan|başak|terazi|akrep|yay|oğlak|kova|balık)\b|\byükselen\s+(koç|boğa|ikizler|yengeç|aslan|başak|terazi|akrep|yay|oğlak|kova|balık)\b/i

export function looksLikeAstrologyContent(
  title: string,
  content = '',
  tags: string[] = []
): boolean {
  const tagBlob = tags.join(' ')
  const text = `${title} ${content.slice(0, 2000)} ${tagBlob}`.toLocaleLowerCase('tr-TR')

  // Birincil sinyal varsa kesinlikle astroloji
  if (ASTROLOGY_ANCHOR.test(text)) return true

  // Zodiac adı + burç/yorum bağlamı varsa astroloji
  if (ZODIAC_IN_CONTEXT.test(text)) return true

  return false
}

/**
 * If the article is clearly astrology/horoscope, force `astroloji`
 * (never leave it on parent `yasam` or nearby lifestyle buckets).
 *
 * ANCAK: ekonomi/borsa/siyaset/spor gibi kategoriler asla astroloji'ye çevrilmez.
 * "boğa piyasası", "aslan payı", "yay çekti" gibi ifadeler zodiac kelimesi içerse
 * de bu kategorilerin içeriği astroloji DEĞİLDİR.
 */
export function applyAstrologyCategoryOverride(
  categoryId: string,
  title: string,
  content = '',
  tags: string[] = []
): string {
  // Finansal/siyasi/spor kategoriler hiçbir zaman astroloji'ye dönmez
  if (NON_ASTROLOGY_CATEGORIES.has(categoryId)) return categoryId

  if (!looksLikeAstrologyContent(title, content, tags)) return categoryId
  return 'astroloji'
}

/**
 * MasterChef Türkiye / TV yarışma — magazin (veya gastronomi); asla dunya.
 */
export function looksLikeMasterChefTurkiyeContent(
  title: string,
  content = '',
  tags: string[] = []
): boolean {
  const text = `${title} ${content.slice(0, 2500)} ${tags.join(' ')}`
  if (!MASTERCHEF_TV.test(text)) return false
  const lower = text.toLocaleLowerCase('tr-TR')
  const hasTr =
    lower.includes('türkiye') ||
    lower.includes('turkiye') ||
    TR_TV_COMPETITION.test(text) ||
    tags.some((t) => /masterchef/i.test(t))
  return hasTr
}

/**
 * Force magazin for domestic MasterChef/TV competition misfiled as dunya/gundem.
 * Leaves gastronomi alone (also acceptable); never leaves dunya.
 */
export function applyMasterChefCategoryOverride(
  categoryId: string,
  title: string,
  content = '',
  tags: string[] = []
): string {
  if (!looksLikeMasterChefTurkiyeContent(title, content, tags)) return categoryId
  if (categoryId === 'gastronomi' || categoryId === 'magazin') return categoryId
  if (
    categoryId === 'dunya' ||
    categoryId === 'gundem' ||
    categoryId === 'yasam' ||
    categoryId === 'kultur'
  ) {
    return 'magazin'
  }
  return categoryId
}

/** Compose hard overrides applied after AI stage3 / before publish. */
export function applyHardCategoryOverrides(
  categoryId: string,
  title: string,
  content = '',
  tags: string[] = []
): string {
  let id = applyMasterChefCategoryOverride(categoryId, title, content, tags)
  id = applyAstrologyCategoryOverride(id, title, content, tags)
  return id
}
