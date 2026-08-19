const TR_STOP = new Set([
  've', 'ile', 'için', 'icin', 'bir', 'bu', 'da', 'de', 'mi', 'mı', 'mu', 'mü',
  'ne', 'ya', 'ki', 'ama', 'fakat', 'ancak', 'veya', 'gibi', 'daha', 'en', 'çok',
  'cok', 'son', 'dakika', 'haber', 'haberi', 'iddia', 'işte', 'iste', 'var', 'yok',
  'olan', 'olarak', 'sonra', 'önce', 'once', 'bugün', 'bugun', 'dün', 'dun',
  'yarın', 'yarin', 'iletişim', 'devam', 'etti', 'oldu', 'dedi', 'açıkladı',
  'acikladi', 'the', 'and', 'for',
])

const EN_STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'as',
  'is', 'was', 'are', 'were', 'be', 'been', 'by', 'from', 'with', 'that', 'this',
  'it', 'its', 'after', 'before', 'over', 'into', 'about', 'says', 'said', 'new',
  'news', 'latest', 'breaking', 'update', 'live',
])

export const WEAK_EVENT_TOKENS = new Set([
  'yangın', 'yangin', 'deprem', 'erdogan', 'erdoğan', 'trump', 'istanbul',
  'türkiye', 'turkiye', 'ankara', 'izmir', 'haber', 'fire', 'earthquake',
  'president', 'bakan', 'başkan', 'baskan', 'açıklama', 'aciklama',
])

export function localeLower(text: string, language?: string | null): string {
  const lang = (language || '').toLowerCase()
  if (lang.startsWith('tr')) return text.toLocaleLowerCase('tr-TR')
  return text.toLocaleLowerCase('en-US')
}

export function stripHtml(input: string): string {
  return input.replace(/<[^>]+>/g, ' ')
}

export function normalizeNewsText(input: string, language?: string | null): string {
  return localeLower(stripHtml(input), language)
    .replace(/https?:\/\/\s*\S+/g, ' ')
    .replace(/www\.\S+/g, ' ')
    .replace(/utm_[a-z0-9]+=\S+/g, ' ')
    .replace(/['’`]/g, ' ')
    .replace(/[^\p{L}\p{N}\s.-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function isStopToken(token: string, language?: string | null): boolean {
  const lang = (language || '').toLowerCase()
  if (lang.startsWith('tr')) return TR_STOP.has(token)
  if (lang.startsWith('en')) return EN_STOP.has(token)
  return TR_STOP.has(token) || EN_STOP.has(token)
}

export function lightStem(token: string, language?: string | null): string {
  if (token.length < 7) return token
  const lang = (language || '').toLowerCase()
  if (lang.startsWith('en')) {
    const stemmed = token.replace(/(ing|ed|es|s)$/i, '')
    return stemmed.length >= 4 ? stemmed : token
  }
  const stemmed = token.replace(
    /(lığı|liği|lugu|lüğü|ları|leri|ndan|nden|ından|inden|ını|ini|unu|ünü|nın|nin|nun|nün|dan|den|tan|ten|lar|ler|lık|lik|luk|lük|da|de|ta|te)$/u,
    ''
  )
  return stemmed.length >= 5 ? stemmed : token
}

export function tokenizeNormalized(text: string, language?: string | null): string[] {
  return normalizeNewsText(text, language)
    .split(/[\s.]+/)
    .map((t) => t.replace(/^-+|-+$/g, ''))
    .filter((t) => t.length > 1 && !isStopToken(t, language))
    .map((t) => {
      const stemmed = lightStem(t, language)
      return stemmed.length >= 3 ? stemmed : t
    })
}

export function shingles(tokens: string[], size = 3): string[] {
  if (tokens.length < size) return tokens.length ? [tokens.join(' ')] : []
  const out: string[] = []
  for (let i = 0; i <= tokens.length - size; i++) {
    out.push(tokens.slice(i, i + size).join(' '))
  }
  return out
}

export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = a instanceof Set ? a : new Set(a)
  const sb = b instanceof Set ? b : new Set(b)
  if (!sa.size && !sb.size) return 1
  if (!sa.size || !sb.size) return 0
  let inter = 0
  for (const token of sa) if (sb.has(token)) inter += 1
  return inter / (sa.size + sb.size - inter)
}
