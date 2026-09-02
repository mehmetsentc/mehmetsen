/**
 * Deterministic Smart Feed summary selection — no AI.
 * Prefer complete editorial paragraphs; never cut mid-word for display.
 */

export type SmartFeedSummaryFields = {
  smartFeedSummary?: string | null
  summary?: string | null
  spot?: string | null
  description?: string | null
  teaser?: string | null
}

const ROUND_TRUNCATION_LENGTHS = new Set([120, 160, 180, 200, 240, 280, 300, 400, 500])

function normalize(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length ? t : null
}

/** True when text likely ends mid-word / mid-sentence from a storage cap. */
export function looksTruncatedMidWord(text: string): boolean {
  const t = text.trim()
  if (t.length < 40) return false
  // "... yasakladı. K" — orphan trailing fragment after sentence end
  if (/[.!?…]["']?\s+[A-Za-zÇĞİÖŞÜçğıöşü0-9]{1,3}$/u.test(t)) return true
  if (/[.!?…]["']?\s*$/u.test(t)) return false
  if (ROUND_TRUNCATION_LENGTHS.has(t.length)) return true
  // Ends with a letter and no sentence punctuation → likely hard cut
  if (/[A-Za-zÇĞİÖŞÜçğıöşü]$/u.test(t) && t.length >= 160) return true
  return false
}

/** Trim to last complete sentence when a trailing fragment exists. */
export function trimToCompleteSentences(text: string): string {
  const t = text.trim()
  if (!t) return t

  // Drop orphan fragment after final sentence: "... yaptı. K" → "... yaptı."
  const orphan = t.match(/^([\s\S]*[.!?…]["']?)\s+[A-Za-zÇĞİÖŞÜçğıöşü0-9]{1,3}$/u)
  if (orphan?.[1] && orphan[1].trim().length >= 40) return orphan[1].trim()

  if (!looksTruncatedMidWord(t)) return t

  const match = t.match(/^([\s\S]*[.!?…]["']?)(?=\s|$)/u)
  if (match?.[1] && match[1].trim().length >= 40) return match[1].trim()

  // Fall back: cut at last whitespace (never mid-grapheme / mid-word)
  const lastSpace = t.lastIndexOf(' ')
  if (lastSpace >= 40) return t.slice(0, lastSpace).trim()
  return t
}

function firstCompleteParagraph(text: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const lead = paras[0] ?? text.replace(/\s+/g, ' ').trim()
  return trimToCompleteSentences(lead)
}

function scoreCandidate(text: string): number {
  let score = text.length
  if (!looksTruncatedMidWord(text)) score += 500
  if (/[.!?…]["']?\s*$/u.test(text.trim())) score += 200
  if (text.length >= 80 && text.length <= 600) score += 50
  return score
}

/**
 * Pick the best stored editorial summary for Smart Feed display.
 * Hierarchy: smartFeedSummary → spot → summary → description/teaser,
 * preferring complete (non mid-word) text.
 */
export function selectSmartFeedSummary(fields: SmartFeedSummaryFields): string | null {
  const ordered = [
    normalize(fields.smartFeedSummary),
    normalize(fields.spot),
    normalize(fields.summary),
    normalize(fields.description),
    normalize(fields.teaser),
  ].filter((v): v is string => Boolean(v))

  if (!ordered.length) return null

  // Extremely long malformed blob → first complete paragraph only
  const MAX_RAW = 1200
  const prepared = ordered.map((t) => firstCompleteParagraph(t.length > MAX_RAW ? t.slice(0, MAX_RAW) : t))

  let best = prepared[0]!
  let bestScore = scoreCandidate(best)
  for (let i = 1; i < prepared.length; i++) {
    const c = prepared[i]!
    const s = scoreCandidate(c)
    if (s > bestScore) {
      best = c
      bestScore = s
    }
  }

  return best.length ? best : null
}
