/**
 * Deterministic Smart Feed summary selection — no AI.
 * Concise teaser only: never full article body.
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

/** Soft product target for one Reels-card teaser paragraph. */
export const SMART_FEED_SUMMARY_TARGET_MAX = 420
export const SMART_FEED_SUMMARY_TARGET_MIN = 120
/** Hard ceiling — anything longer is treated as body-like and trimmed to sentences. */
export const SMART_FEED_SUMMARY_HARD_MAX = 480

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
    if (acc.length >= SMART_FEED_SUMMARY_TARGET_MIN && parts.length >= 2 && acc.length >= maxChars * 0.7) {
      break
    }
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

function isNaturallyConcise(raw: string): boolean {
  const lead = firstCompleteParagraph(raw)
  return (
    lead.length >= 40 &&
    lead.length <= SMART_FEED_SUMMARY_TARGET_MAX &&
    !looksTruncatedMidWord(lead) &&
    /[.!?…]["']?/u.test(lead)
  )
}

function scoreCandidate(trimmed: string, originalLen: number): number {
  const len = trimmed.length
  let score = 0
  if (!looksTruncatedMidWord(trimmed)) score += 500
  if (/[.!?…]["']?\s*$/u.test(trimmed.trim())) score += 200
  if (len >= SMART_FEED_SUMMARY_TARGET_MIN && len <= SMART_FEED_SUMMARY_TARGET_MAX) score += 400
  else if (len < SMART_FEED_SUMMARY_TARGET_MIN) score += 80 + len
  else if (len <= SMART_FEED_SUMMARY_HARD_MAX) score += 150
  else score -= Math.min(800, len - SMART_FEED_SUMMARY_HARD_MAX)

  // Penalize fields that were body-length and had to be carved down
  if (originalLen > SMART_FEED_SUMMARY_HARD_MAX) score -= 250
  if (originalLen > 800) score -= 400
  if (originalLen > 1500) score -= 500
  if (originalLen > len * 2.5) score -= 200
  return score
}

/**
 * Pick a concise editorial teaser for Smart Feed.
 * Priority: smartFeedSummary → spot → summary → description → teaser.
 * Never uses body/content. Caps body-like fields via sentence-aware trim.
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

  // Pass 1: first naturally concise complete field wins (priority order)
  for (const raw of ordered) {
    if (isNaturallyConcise(raw)) {
      return takeCompleteSentencesUpTo(firstCompleteParagraph(raw), SMART_FEED_SUMMARY_TARGET_MAX)
    }
  }

  // Pass 2: score trimmed candidates; prefer less body-like sources
  const prepared = ordered.map((raw) => {
    const lead = firstCompleteParagraph(raw)
    const trimmed = takeCompleteSentencesUpTo(lead, SMART_FEED_SUMMARY_TARGET_MAX)
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

  const final = takeCompleteSentencesUpTo(best.trimmed, SMART_FEED_SUMMARY_HARD_MAX)
  return final.length ? final : null
}
