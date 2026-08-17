/**
 * Queue-item quality heuristic + light optional AI compare.
 * Prefer richer body, real image, clearer title — used to drop weaker duplicates.
 */
import type { NewsroomArticleInput } from '@/services/newsroom/types'

export interface QueueQualityInput {
  title: string
  summary?: string
  content?: string
  imageUrl?: string
  sourceLabel?: string
}

export type QualityKeepSide = 'a' | 'b' | 'tie'

export interface QualityCompareResult {
  scoreA: number
  scoreB: number
  keep: QualityKeepSide
  gap: number
  reason: string
  /** True when scores are close — prefer admin/AI review over auto-delete */
  borderline: boolean
}

const BORDERLINE_GAP = 8
/** Auto-drop only when quality gap is clear */
export const AUTO_DROP_QUALITY_GAP = 12

/** Below this, already-extracted copy is never enqueued (thin / worthless). */
export const MIN_ENQUEUE_QUALITY = Number(process.env.NEWSROOM_MIN_ENQUEUE_QUALITY ?? 35)

/** Pipeline fetches the source page when RSS/scraper body is shorter than this. */
export const EXTRACTABLE_BODY_MAX = 500

export function isTooThinToEnqueue(score: number): boolean {
  return score < MIN_ENQUEUE_QUALITY
}

/**
 * Drop junk at ingest only when extraction cannot save it:
 * URL-only / short RSS still goes to the pipeline (full-page fetch).
 */
export function shouldSkipThinEnqueue(input: NewsroomArticleInput): boolean {
  const score = scoreFromArticleInput(input)
  if (!isTooThinToEnqueue(score)) return false
  const bodyLen = [input.originalSummary, input.originalContent].filter(Boolean).join(' ').trim().length
  const hasUrl = Boolean(input.sourceUrl?.trim())
  if (hasUrl && bodyLen < EXTRACTABLE_BODY_MAX) return false
  return true
}

export function isEnqueueSkipId(id: string): boolean {
  return /^(thin-skip-|peer-skip-|library-skip-)/.test(id)
}

function bodyText(input: QueueQualityInput): string {
  return [input.summary, input.content].filter(Boolean).join(' ').trim()
}

/** 0–100 heuristic — no AI. */
export function scoreQueueContentQuality(input: QueueQualityInput): number {
  let score = 40
  const title = (input.title ?? '').trim()
  const body = bodyText(input)
  const bodyLen = body.length
  const titleLen = title.length

  if (bodyLen >= 1200) score += 28
  else if (bodyLen >= 700) score += 22
  else if (bodyLen >= 350) score += 15
  else if (bodyLen >= 150) score += 8
  else if (bodyLen >= 60) score += 2
  else score -= 12

  if (input.imageUrl?.trim().startsWith('http')) score += 16
  else score -= 4

  // Clear, mid-length titles beat stubs / site-name dumps
  if (titleLen >= 36 && titleLen <= 110) score += 12
  else if (titleLen >= 22 && titleLen <= 140) score += 6
  else if (titleLen < 14) score -= 10
  else if (titleLen > 160) score -= 6

  // Mild penalty for "Title - Outlet Name" noise when outlet eats half the string
  const dashSplit = title.split(/\s[-–|]\s/)
  if (dashSplit.length >= 2 && (dashSplit[dashSplit.length - 1]?.length ?? 0) > 25) {
    score -= 3
  }

  // ALL-CAPS clickbait
  const letters = title.replace(/[^A-Za-zÀ-ÿĞğÜüŞşİıÖöÇç]/g, '')
  if (letters.length > 12 && letters === letters.toLocaleUpperCase('tr-TR')) {
    score -= 8
  }

  // Prefer agency-ish labels slightly (AA/DHA/İHA often fuller wire copy)
  const src = (input.sourceLabel ?? '').toLocaleLowerCase('tr-TR')
  if (/\b(aa|dha|iha|anka|reuters|afp)\b/.test(src)) score += 3

  return Math.max(0, Math.min(100, score))
}

export function scoreFromArticleInput(input: NewsroomArticleInput): number {
  return scoreQueueContentQuality({
    title: input.originalTitle,
    summary: input.originalSummary,
    content: input.originalContent,
    imageUrl: input.imageUrl,
    sourceLabel: input.sourceLabel,
  })
}

export function compareQueueQuality(
  a: QueueQualityInput,
  b: QueueQualityInput
): QualityCompareResult {
  const scoreA = scoreQueueContentQuality(a)
  const scoreB = scoreQueueContentQuality(b)
  const gap = Math.abs(scoreA - scoreB)

  if (gap < BORDERLINE_GAP) {
    return {
      scoreA,
      scoreB,
      keep: 'tie',
      gap,
      reason: `borderline:${scoreA}vs${scoreB}`,
      borderline: true,
    }
  }

  if (scoreA > scoreB) {
    return {
      scoreA,
      scoreB,
      keep: 'a',
      gap,
      reason: `richer:${scoreA}>${scoreB}`,
      borderline: false,
    }
  }

  return {
    scoreA,
    scoreB,
    keep: 'b',
    gap,
    reason: `richer:${scoreB}>${scoreA}`,
    borderline: false,
  }
}

/**
 * Optional light AI pick when heuristic is borderline.
 * Returns null if AI unavailable / fails — caller keeps both or flags review.
 */
export async function aiPickBetterQueueItem(
  a: QueueQualityInput,
  b: QueueQualityInput
): Promise<{ keep: 'a' | 'b'; reason: string } | null> {
  try {
    const { deepseekChatCompletion } = await import('@/lib/ai/deepseekClient')
    const prompt = `İki haber kuyruk kaydı aynı olayın tekrarı olabilir. Hangisi yayın için daha kaliteli?

A:
BAŞLIK: ${a.title}
ÖZET: ${(a.summary ?? '').slice(0, 400)}
İÇERİK: ${(a.content ?? '').slice(0, 800)}
GÖRSEL: ${a.imageUrl?.startsWith('http') ? 'var' : 'yok'}

B:
BAŞLIK: ${b.title}
ÖZET: ${(b.summary ?? '').slice(0, 400)}
İÇERİK: ${(b.content ?? '').slice(0, 800)}
GÖRSEL: ${b.imageUrl?.startsWith('http') ? 'var' : 'yok'}

Kurallar: daha uzun/doğru gövde, net başlık, görsel varlığı öncelikli. Emin değilsen A seç.
Sadece JSON: {"keep":"a"|"b","reason":"kısa Türkçe"}`

    const text = await deepseekChatCompletion({
      messages: [
        {
          role: 'system',
          content: 'NaHaber kuyruk kalite hakemi. Sadece JSON döndür.',
        },
        { role: 'user', content: prompt },
      ],
      maxTokens: 120,
      temperature: 0.1,
    })

    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return null
    const parsed = JSON.parse(match[0]) as { keep?: string; reason?: string }
    if (parsed.keep !== 'a' && parsed.keep !== 'b') return null
    return {
      keep: parsed.keep,
      reason: typeof parsed.reason === 'string' ? parsed.reason.slice(0, 120) : 'ai_pick',
    }
  } catch (err) {
    console.warn('[aiPickBetterQueueItem] failed:', err)
    return null
  }
}
