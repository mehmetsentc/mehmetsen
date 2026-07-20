/**
 * Hard category overrides when AI / heuristics pick a parent or wrong bucket.
 * Astrology is a Yaşam child — burç content must never stay on `yasam`.
 */

const ASTROLOGY_SIGNAL =
  /astroloji|astrology|horoscope|burç|burclar|günlük\s*burç|haftalık\s*burç|aylık\s*burç|yükselen|retrosu|zodiac|zodyak|koç\s*burcu|boğa\s*burcu|ikizler\s*burcu|yengeç\s*burcu|aslan\s*burcu|başak\s*burcu|terazi\s*burcu|akrep\s*burcu|yay\s*burcu|oğlak\s*burcu|kova\s*burcu|balık\s*burcu|\b(koç|boğa|ikizler|yengeç|aslan|başak|terazi|akrep|yay|oğlak|kova|balık)\b.*\bburc|\bburc.*\b(koç|boğa|ikizler|yengeç|aslan|başak|terazi|akrep|yay|oğlak|kova|balık)\b/i

export function looksLikeAstrologyContent(
  title: string,
  content = '',
  tags: string[] = []
): boolean {
  const tagBlob = tags.join(' ')
  const text = `${title} ${content.slice(0, 2000)} ${tagBlob}`.toLocaleLowerCase('tr-TR')
  return ASTROLOGY_SIGNAL.test(text)
}

/**
 * If the article is clearly astrology/horoscope, force `astroloji`
 * (never leave it on parent `yasam` or nearby lifestyle buckets).
 */
export function applyAstrologyCategoryOverride(
  categoryId: string,
  title: string,
  content = '',
  tags: string[] = []
): string {
  if (!looksLikeAstrologyContent(title, content, tags)) return categoryId
  return 'astroloji'
}
