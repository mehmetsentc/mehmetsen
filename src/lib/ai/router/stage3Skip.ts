const GENERIC_UNRESOLVED = new Set(['yerel-haber', 'kibris-haberleri'])

export type Stage3SkipInput = {
  categoryId?: string | null
  confidence?: number | null
  country?: string | null
  tags?: string[] | null
}

/**
 * Conservative skip for the second category LLM.
 * Default production flag is OFF — this only describes when a skip would be safe.
 */
export function shouldSkipRedundantCategoryClassifier(input: Stage3SkipInput): boolean {
  const categoryId = input.categoryId?.trim() ?? ''
  if (!categoryId || GENERIC_UNRESOLVED.has(categoryId)) return false
  const confidence = Number(input.confidence ?? 0)
  if (!Number.isFinite(confidence) || confidence < 80) return false
  const country = input.country?.trim() ?? ''
  if (!country) return false
  const tags = Array.isArray(input.tags) ? input.tags.filter((t) => t.trim()) : []
  if (tags.length < 1) return false
  return true
}
