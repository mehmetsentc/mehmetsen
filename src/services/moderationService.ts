/**
 * Server-side content moderation.
 *
 * This module is intended to run ONLY on the server (it is called from the
 * `/api/moderate` route). It MUST NOT be imported into client components, since
 * it reads secret env vars (e.g. `OPENAI_API_KEY`).
 *
 * Decision model:
 *   - 'approve' → content is clean and can be published immediately.
 *   - 'review'  → content is flagged/uncertain and should be held as `pending`
 *                 for admin/system approval.
 *
 * Provider strategy (pluggable):
 *   1. If `OPENAI_API_KEY` is set, text (and any image media) are checked with
 *      the OpenAI Moderation API (`omni-moderation-latest`), which accepts both
 *      text and `image_url` inputs. Implemented with `fetch` so we add no SDK
 *      dependency.
 *   2. Otherwise we fall back to a deterministic Turkish + English keyword
 *      heuristic for text.
 *
 * Media policy:
 *   - The OpenAI moderation endpoint can score images but NOT videos. For video
 *     media (and for ALL media when no AI key is configured) we apply the
 *     `MODERATE_MEDIA_DEFAULT` policy:
 *       - 'approve' (DEFAULT): media that we can't inspect is allowed through so
 *         the app stays usable. Real vision/video moderation requires a key.
 *       - 'review': any media we can't inspect forces the post into review.
 *
 * Failure mode:
 *   - Any unexpected error results in a 'review' decision (fail closed to
 *     draft/pending). We never publish unchecked content on error.
 */

export type ModerationDecision = 'approve' | 'review'

export type ModerationMediaType = 'image' | 'video'

export interface ModerationMedia {
  url: string
  type: ModerationMediaType
}

export interface ModerationInput {
  text?: string
  mediaUrls?: ModerationMedia[]
}

export interface ModerationResult {
  decision: ModerationDecision
  reasons: string[]
  scores?: Record<string, number>
  provider: 'openai' | 'heuristic'
}

type MediaPolicy = 'approve' | 'review'

function getMediaPolicy(): MediaPolicy {
  return process.env.MODERATE_MEDIA_DEFAULT === 'review' ? 'review' : 'approve'
}

/**
 * Turkish + English sensitive/banned keyword list used by the no-key fallback.
 * Kept intentionally conservative (whole-word matches) to limit false
 * positives. This is a heuristic safety net, NOT a substitute for a real
 * moderation provider.
 */
const BANNED_KEYWORDS: string[] = [
  // Explicit / profanity (TR)
  'amk',
  'amına',
  'orospu',
  'piç',
  'yarrak',
  'sik',
  'sikeyim',
  'göt',
  'gavat',
  'pezevenk',
  'oç',
  // Hate / slurs (TR)
  'gavur',
  'şerefsiz',
  // Violence / threats (TR)
  'öldüreceğim',
  'öldürürüm',
  'tecavüz',
  'bomba',
  'katledin',
  'kafa keseceğiz',
  // Explicit / profanity (EN)
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'cunt',
  'rape',
  'porn',
  'nsfw',
  // Hate / violence (EN)
  'kill you',
  'kill them',
  'terrorist attack',
  'behead',
]

function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .replace(/[\u0307]/g, '') // stray combining dots from İ/ı casing
}

function findBannedKeywords(text: string): string[] {
  if (!text.trim()) return []
  const haystack = normalizeText(text)
  const hits: string[] = []
  for (const keyword of BANNED_KEYWORDS) {
    const needle = normalizeText(keyword)
    // Word-ish boundary check: surrounded by non-letter chars or string edges.
    const pattern = new RegExp(
      `(^|[^\\p{L}])${escapeRegExp(needle)}([^\\p{L}]|$)`,
      'u'
    )
    if (pattern.test(haystack)) hits.push(keyword)
  }
  return hits
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const OPENAI_MODERATION_URL = 'https://api.openai.com/v1/moderations'
const OPENAI_MODERATION_MODEL = 'omni-moderation-latest'
const OPENAI_TIMEOUT_MS = 10_000

interface OpenAIModerationCategoryResult {
  flagged: boolean
  categories: Record<string, boolean>
  category_scores: Record<string, number>
}

interface OpenAIModerationResponse {
  results?: OpenAIModerationCategoryResult[]
}

type OpenAIModerationInputItem =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

async function moderateWithOpenAI(
  apiKey: string,
  text: string | undefined,
  imageUrls: string[]
): Promise<{ flagged: boolean; reasons: string[]; scores: Record<string, number> }> {
  const input: OpenAIModerationInputItem[] = []
  if (text && text.trim()) {
    input.push({ type: 'text', text: text.slice(0, 8000) })
  }
  for (const url of imageUrls) {
    input.push({ type: 'image_url', image_url: { url } })
  }

  if (input.length === 0) {
    return { flagged: false, reasons: [], scores: {} }
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  try {
    const res = await fetch(OPENAI_MODERATION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: OPENAI_MODERATION_MODEL, input }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`OpenAI moderation responded ${res.status}`)
    }

    const data = (await res.json()) as OpenAIModerationResponse
    const result = data.results?.[0]
    if (!result) {
      throw new Error('OpenAI moderation returned no results')
    }

    const reasons = Object.entries(result.categories)
      .filter(([, isFlagged]) => isFlagged)
      .map(([category]) => category)

    return {
      flagged: Boolean(result.flagged),
      reasons,
      scores: result.category_scores ?? {},
    }
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Runs moderation over the provided text + media and returns a decision.
 * Always resolves; on any internal failure it returns a 'review' decision.
 */
export async function moderateContent(input: ModerationInput): Promise<ModerationResult> {
  const text = input.text?.trim() ?? ''
  const media = input.mediaUrls ?? []
  const imageUrls = media.filter((m) => m.type === 'image').map((m) => m.url).filter(Boolean)
  const videoUrls = media.filter((m) => m.type === 'video').map((m) => m.url).filter(Boolean)
  const mediaPolicy = getMediaPolicy()

  const apiKey = process.env.OPENAI_API_KEY

  try {
    const reasons: string[] = []
    let scores: Record<string, number> | undefined
    let provider: ModerationResult['provider'] = 'heuristic'

    if (apiKey) {
      provider = 'openai'
      const ai = await moderateWithOpenAI(apiKey, text, imageUrls)
      scores = ai.scores
      if (ai.flagged) {
        reasons.push(...ai.reasons.map((r) => `ai:${r}`))
      }
    } else {
      const keywordHits = findBannedKeywords(text)
      if (keywordHits.length > 0) {
        reasons.push(...keywordHits.map((k) => `keyword:${k}`))
      }
      // Without an AI key, images are not inspected → governed by media policy.
      if (imageUrls.length > 0 && mediaPolicy === 'review') {
        reasons.push('media:image-unverified')
      }
    }

    // Videos can never be inspected by the moderation endpoint → media policy.
    if (videoUrls.length > 0 && mediaPolicy === 'review') {
      reasons.push('media:video-unverified')
    }

    const decision: ModerationDecision = reasons.length > 0 ? 'review' : 'approve'
    return { decision, reasons, scores, provider }
  } catch (error) {
    // Fail closed: hold for review rather than publish unchecked content.
    const reason = error instanceof Error ? error.message : 'unknown moderation error'
    return {
      decision: 'review',
      reasons: [`error:${reason}`],
      provider: apiKey ? 'openai' : 'heuristic',
    }
  }
}
