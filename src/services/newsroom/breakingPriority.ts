/**
 * Breaking priority scoring and feed flags (0–100).
 */
import type { NewsroomArticleInput } from '@/services/newsroom/types'

export interface BreakingFlags {
  breakingScore: number
  isPinned: boolean
  isTrending: boolean
  shouldPushNotify: boolean
}

const URGENCY_KEYWORDS = [
  'son dakika',
  'flaş',
  'flash',
  'breaking',
  'acil',
  'deprem',
  'patlama',
  'çatışma',
  'catisma',
  'ölüm',
  'olum',
  'can kaybı',
  'can kaybi',
  'saldırı',
  'saldiri',
  'yangın',
  'yangin',
] as const

export function computeBreakingScore(
  input: NewsroomArticleInput,
  rewrittenTitle: string,
  rewrittenBody: string,
  isBreaking: boolean,
  aiPriority?: number
): number {
  if (input.priorityScore != null) {
    return Math.min(100, Math.max(0, input.priorityScore))
  }

  let score = isBreaking ? 55 : 30
  const text = `${rewrittenTitle} ${rewrittenBody}`.toLocaleLowerCase('tr-TR')

  for (const kw of URGENCY_KEYWORDS) {
    if (text.includes(kw)) score += 8
  }

  if (input.sourcePublishedAt) {
    const ageMin = (Date.now() - input.sourcePublishedAt) / 60_000
    if (ageMin < 15) score += 20
    else if (ageMin < 45) score += 12
    else if (ageMin < 120) score += 6
  }

  if (aiPriority != null) {
    score = Math.round(score * 0.6 + aiPriority * 0.4)
  }

  return Math.min(100, Math.max(0, score))
}

export function resolveBreakingFlags(breakingScore: number): BreakingFlags {
  return {
    breakingScore,
    isPinned: breakingScore > 80,
    isTrending: breakingScore > 70,
    shouldPushNotify: breakingScore > 90,
  }
}

/** Stub — queue push for breakingScore > 90 (wired when FCM topic broadcast exists). */
export async function queueBreakingPushNotification(
  newsId: string,
  title: string,
  breakingScore: number
): Promise<void> {
  if (breakingScore <= 90) return
  console.log(
    `[newsroom/push-stub] breaking alert queued newsId=${newsId} score=${breakingScore} title="${title.slice(0, 80)}"`
  )
}
