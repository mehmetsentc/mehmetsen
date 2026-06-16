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

/** Send a web push notification for breaking news (score > 90). */
export async function queueBreakingPushNotification(
  newsId: string,
  title: string,
  breakingScore: number
): Promise<void> {
  if (breakingScore <= 90) return

  try {
    // Lazy server-only import — avoids client bundle issues
    const { broadcastPush } = await import('@/lib/pushSender.server')

    // Fetch the published article to get slug + image
    const { getAdminFirestore } = await import('@/lib/firebase/admin')
    const db = getAdminFirestore()
    const doc = await db.collection('news').doc(newsId).get()
    const data = doc.data()
    const slug: string = data?.slug ?? newsId
    const summary: string = (data?.spot ?? data?.summary ?? '').slice(0, 120)
    const image: string | undefined = data?.coverImageUrl ?? data?.thumbnail ?? undefined

    await broadcastPush({
      title: `🔴 SON DAKİKA: ${title}`,
      body: summary,
      url: `https://www.nahaber.com/haber/${slug}`,
      image,
      tag: `breaking-${newsId}`,
      breaking: true,
      postId: newsId,
    })

    console.log(`[newsroom/push] sent breaking push newsId=${newsId} score=${breakingScore}`)
  } catch (err) {
    // Push failure must NOT block article publishing
    console.error(`[newsroom/push] failed newsId=${newsId}:`, err)
  }
}
