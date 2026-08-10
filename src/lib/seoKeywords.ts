const TR_STOP_WORDS = new Set([
  've', 'ile', 'de', 'da', 'den', 'dan', 'bir', 'bu', 'için', 'olan',
  'olarak', 'ise', 'gibi', 'çok', 'daha', 'en', 'ne', 'her', 'ya',
  'mi', 'mı', 'mu', 'mü', 'ama', 'ancak', 'hem', 'kadar', 'sonra',
  'önce', 'üzere', 'dolayı', 'rağmen', 'karşı', 'arasında',
])

/** Derive SEO keywords from title, tags and spot when AI fails to produce them. */
export function deriveSeoKeywords(title: string, tags: string[], spot: string): string[] {
  const words = `${title} ${spot}`
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !TR_STOP_WORDS.has(w))
  const unique = [...new Set([...tags.map((t) => t.toLowerCase()), ...words])]
  return unique.slice(0, 10)
}

export function normalizeSeoKeywordList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map(String)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 15)
}

export function extractSeoKeywordsFromAiPayload(parsed: Record<string, unknown>): string[] {
  const fromKeywords = normalizeSeoKeywordList(parsed.keywords)
  if (fromKeywords.length > 0) return fromKeywords
  return normalizeSeoKeywordList(parsed.seoKeywords)
}
