const STOPWORDS: Record<string, string[]> = {
  tr: ['ve', 'bir', 'bu', 'icin', 'ile', 'olan', 'daha', 'sonra', 'ancak', 'haber'],
  en: ['the', 'and', 'for', 'that', 'with', 'from', 'this', 'have', 'said', 'will'],
  de: ['und', 'der', 'die', 'das', 'den', 'mit', 'ist', 'nicht', 'auf', 'eine'],
  fr: ['les', 'des', 'une', 'dans', 'pour', 'que', 'est', 'pas', 'plus', 'avec'],
  es: ['los', 'las', 'del', 'una', 'para', 'que', 'con', 'por', 'como', 'esta'],
  pt: ['uma', 'para', 'que', 'com', 'por', 'nao', 'mais', 'como', 'dos', 'das'],
  it: ['che', 'per', 'con', 'una', 'del', 'della', 'sono', 'come', 'non', 'piu'],
  ru: ['и', 'в', 'на', 'что', 'не', 'как', 'это', 'по', 'из', 'за'],
  ar: ['في', 'من', 'على', 'أن', 'هذا', 'التي', 'عن', 'إلى', 'ما', 'كان'],
}

function scriptHint(text: string): string | null {
  if (/[\u0600-\u06FF]/.test(text)) return 'ar'
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'
  if (/[\u3040-\u30FF]/.test(text)) return 'ja'
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko'
  if (/[\u4E00-\u9FFF]/.test(text)) return 'zh'
  if (/[\u0590-\u05FF]/.test(text)) return 'he'
  if (/[\u0900-\u097F]/.test(text)) return 'hi'
  return null
}

function latinGuess(text: string): string {
  const tokens = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1)
  const scores: Record<string, number> = {}
  for (const [lang, words] of Object.entries(STOPWORDS)) {
    if (['ru', 'ar'].includes(lang)) continue
    scores[lang] = 0
    for (const token of tokens) {
      if (words.includes(token)) scores[lang] += 1
    }
  }
  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0]
  if (best && best[1] >= 2) return best[0]
  return 'und'
}

/**
 * Cheap deterministic language hint. Returns BCP-47 primary subtag.
 * Does not translate. Discovery must keep original language.
 */
export function detectLanguage(text: string, fallback?: string | null): string {
  const sample = text.slice(0, 4000).trim()
  if (!sample) return fallback || 'und'
  const script = scriptHint(sample)
  if (script) return script
  const latin = latinGuess(sample)
  if (latin !== 'und') return latin
  return fallback || 'und'
}

export function isValidLanguageTag(tag: string | null | undefined): boolean {
  if (!tag) return false
  const trimmed = tag.trim()
  if (trimmed === 'und' || trimmed === 'zxx') return false
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(trimmed)
}
