/**
 * Deterministic Smart Feed summary selection — no AI.
 * Prefer the full stored summary/spot teaser; never dump article body.
 */

export type SmartFeedSummaryFields = {
  smartFeedSummary?: string | null
  summary?: string | null
  spot?: string | null
  description?: string | null
  teaser?: string | null
  /** Explicitly forbidden — ignored if passed. */
  body?: string | null
  content?: string | null
}

const ROUND_TRUNCATION_LENGTHS = new Set([120, 160, 180, 200, 240, 280, 300, 400, 500])

/** Soft product target — used only when carving body-like fields. */
export const SMART_FEED_SUMMARY_TARGET_MAX = 900
export const SMART_FEED_SUMMARY_TARGET_MIN = 40
/**
 * Above this, treat as body-like and carve to complete sentences.
 * Editorial summary/spot fields under this length are shown in full.
 */
export const SMART_FEED_SUMMARY_HARD_MAX = 1200

function normalize(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const t = raw.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
  return t.length ? t : null
}

/** True when text likely ends mid-word / mid-sentence from a storage cap. */
export function looksTruncatedMidWord(text: string): boolean {
  const t = text.trim()
  if (t.length < 40) return false
  if (/[.!?…]["']?\s+[A-Za-zÇĞİÖŞÜçğıöşü0-9]{1,3}$/u.test(t)) return true
  if (/[.!?…]["']?\s*$/u.test(t)) return false
  if (/\.\.\.\s*$/u.test(t) || /…\s*$/u.test(t)) return true
  if (ROUND_TRUNCATION_LENGTHS.has(t.length)) return true
  if (/[A-Za-zÇĞİÖŞÜçğıöşü]$/u.test(t) && t.length >= 160) return true
  return false
}

/** Trim to last complete sentence when a trailing fragment exists. */
export function trimToCompleteSentences(text: string): string {
  const t = text.trim()
  if (!t) return t

  const orphan = t.match(/^([\s\S]*[.!?…]["']?)\s+[A-Za-zÇĞİÖŞÜçğıöşü0-9]{1,3}$/u)
  if (orphan?.[1] && orphan[1].trim().length >= 40) return orphan[1].trim()

  if (!looksTruncatedMidWord(t)) return t

  // Drop trailing editorial "..." / "…" that hide a cut mid-sentence.
  const withoutEllipsis = t.replace(/(?:\.{3}|…)\s*$/u, '').trim()
  if (withoutEllipsis.length >= 40 && withoutEllipsis !== t) {
    const repaired = withoutEllipsis.match(/^([\s\S]*[.!?…]["']?)(?=\s|$)/u)
    if (repaired?.[1] && repaired[1].trim().length >= 40) return repaired[1].trim()
  }

  const match = t.match(/^([\s\S]*[.!?…]["']?)(?=\s|$)/u)
  if (match?.[1] && match[1].trim().length >= 40) return match[1].trim()

  const lastSpace = t.lastIndexOf(' ')
  if (lastSpace >= 40) return t.slice(0, lastSpace).trim()
  return t
}

/**
 * Take complete sentences up to soft max length (never mid-word / mid-sentence).
 */
export function takeCompleteSentencesUpTo(text: string, maxChars = SMART_FEED_SUMMARY_TARGET_MAX): string {
  const t = trimToCompleteSentences(text.replace(/\s+/g, ' ').trim())
  if (t.length <= maxChars) return t

  const sentenceRe = /[^.!?…]+[.!?…]["']?/gu
  const parts: string[] = []
  let acc = ''
  let m: RegExpExecArray | null
  while ((m = sentenceRe.exec(t)) !== null) {
    const next = (acc ? `${acc} ` : '') + m[0].trim()
    if (next.length > maxChars && parts.length > 0) break
    if (next.length > maxChars && parts.length === 0) {
      const cut = m[0].trim().slice(0, maxChars)
      const sp = cut.lastIndexOf(' ')
      return (sp > 40 ? cut.slice(0, sp) : cut).trim()
    }
    acc = next
    parts.push(m[0].trim())
  }
  if (acc) return acc.trim()
  const cut = t.slice(0, maxChars)
  const sp = cut.lastIndexOf(' ')
  return (sp > 40 ? cut.slice(0, sp) : cut).trim()
}

function firstCompleteParagraph(text: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  return paras[0] ?? text.replace(/\s+/g, ' ').trim()
}

function isUsableTeaser(raw: string): boolean {
  const lead = firstCompleteParagraph(raw)
  return lead.length >= SMART_FEED_SUMMARY_TARGET_MIN && lead.length <= SMART_FEED_SUMMARY_HARD_MAX
}

function scoreCandidate(trimmed: string, originalLen: number): number {
  const len = trimmed.length
  let score = 0
  if (!looksTruncatedMidWord(trimmed)) score += 500
  if (/[.!?…]["']?\s*$/u.test(trimmed.trim())) score += 200
  if (len >= SMART_FEED_SUMMARY_TARGET_MIN && len <= SMART_FEED_SUMMARY_HARD_MAX) score += 400
  else if (len < SMART_FEED_SUMMARY_TARGET_MIN) score += 80 + len
  else score -= Math.min(800, len - SMART_FEED_SUMMARY_HARD_MAX)

  if (originalLen > SMART_FEED_SUMMARY_HARD_MAX) score -= 250
  if (originalLen > 2000) score -= 400
  if (originalLen > 4000) score -= 500
  if (originalLen > len * 2.5) score -= 200
  return score
}

/**
 * Pick the editorial teaser for Smart Feed.
 * Priority: smartFeedSummary → spot → summary → description → teaser.
 * Never uses body/content. Full teaser under HARD_MAX; body-like fields carved.
 */
export function selectSmartFeedSummary(fields: SmartFeedSummaryFields): string | null {
  void fields.body
  void fields.content

  const ordered = [
    normalize(fields.smartFeedSummary),
    normalize(fields.spot),
    normalize(fields.summary),
    normalize(fields.description),
    normalize(fields.teaser),
  ].filter((v): v is string => Boolean(v))

  if (!ordered.length) return null

  // Pass 1: usable full teaser in priority order (no soft 420-char carve).
  for (const raw of ordered) {
    const lead = firstCompleteParagraph(raw)
    if (!isUsableTeaser(lead)) continue
    if (looksTruncatedMidWord(lead)) {
      const repaired = trimToCompleteSentences(lead)
      if (repaired.length >= SMART_FEED_SUMMARY_TARGET_MIN && !looksTruncatedMidWord(repaired)) {
        return repaired
      }
      continue
    }
    return lead
  }

  // Pass 2: score carved candidates from longer fields
  const prepared = ordered.map((raw) => {
    const lead = firstCompleteParagraph(raw)
    const trimmed = takeCompleteSentencesUpTo(lead, SMART_FEED_SUMMARY_HARD_MAX)
    return { rawLen: lead.length, trimmed }
  })

  let best = prepared[0]!
  let bestScore = scoreCandidate(best.trimmed, best.rawLen)
  for (let i = 1; i < prepared.length; i++) {
    const c = prepared[i]!
    const s = scoreCandidate(c.trimmed, c.rawLen)
    if (s > bestScore) {
      best = c
      bestScore = s
    }
  }

  const final = trimToCompleteSentences(best.trimmed)
  return final.length ? final : null
}
