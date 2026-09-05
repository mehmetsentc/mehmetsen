import 'server-only'

import { and, eq, gte } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { socialEvents } from '@/db/schema/socialGraph'
import { userInterestScores, userPublisherAffinity } from '@/db/schema/feedRanking'
import { FEED_RANKING_CONFIG_V1 } from '@/lib/feed/rankingConfig'
import type { BehavioralSignal } from '@/lib/feed/rankingConfig'

const EVENT_TO_SIGNAL: Record<string, BehavioralSignal | null> = {
  publisher_follow: 'FOLLOW',
  publisher_followed: 'FOLLOW',
  article_save: 'SAVE',
  article_saved: 'SAVE',
  article_share: 'SHARE',
  article_shared: 'SHARE',
  article_open: 'ARTICLE_OPEN',
  article_opened: 'ARTICLE_OPEN',
  article_dwell: 'LONG_DWELL',
  article_comment: 'COMMENT',
  comment_created: 'COMMENT',
  article_like: 'LIKE',
  article_liked: 'LIKE',
  quick_skip: 'QUICK_SKIP',
}

function interestKey(kind: 'cat' | 'tag' | 'ent', raw: string): string {
  const n = raw.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, '-')
  return `${kind}:${n}`.slice(0, 64)
}

function decayFactor(createdAt: Date, now = new Date()): number {
  const days = (now.getTime() - createdAt.getTime()) / 86_400_000
  const halfLife = FEED_RANKING_CONFIG_V1.behavioralDecayDays
  return Math.pow(0.5, days / halfLife)
}

function dwellBucket(dwellMs: number | undefined): string {
  if (!dwellMs || dwellMs < 3000) return 'under_3s'
  if (dwellMs < 10000) return '3_10s'
  if (dwellMs < 30000) return '10_30s'
  if (dwellMs < 60000) return '30_60s'
  return 'over_60s'
}

export class FeedInterestAggregator {
  async aggregateForUser(userId: string, lookbackDays = FEED_RANKING_CONFIG_V1.behavioralLookbackDays): Promise<void> {
    if (!hasDatabaseUrl()) return

    const db = getDb()
    const since = new Date(Date.now() - lookbackDays * 86_400_000)

    const events = await db
      .select({
        eventType: socialEvents.eventType,
        targetType: socialEvents.targetType,
        targetId: socialEvents.targetId,
        metadata: socialEvents.metadata,
        createdAt: socialEvents.createdAt,
      })
      .from(socialEvents)
      .where(and(eq(socialEvents.userId, userId), gte(socialEvents.createdAt, since)))
      .limit(2000)

    const interestScores = new Map<string, number>()
    const publisherScores = new Map<string, number>()

    for (const ev of events) {
      const signal = EVENT_TO_SIGNAL[ev.eventType]
      if (!signal) continue

      let weight = FEED_RANKING_CONFIG_V1.behavioralSignalWeights[signal]
      if (signal === 'LONG_DWELL') {
        const meta = ev.metadata as { dwellMs?: number } | null
        const bucket = dwellBucket(meta?.dwellMs)
        weight *= FEED_RANKING_CONFIG_V1.dwellBucketNormalization[bucket] ?? 0.5
      }

      const decay = decayFactor(ev.createdAt)
      const delta = weight * decay

      if (ev.targetType === 'category' && ev.targetId) {
        const key = interestKey('cat', ev.targetId)
        interestScores.set(key, (interestScores.get(key) ?? 0) + delta)
        // Legacy flat key for backward-compatible reads
        const flat = ev.targetId.toLowerCase()
        interestScores.set(flat, (interestScores.get(flat) ?? 0) + delta * 0.5)
      } else if (ev.targetType === 'article' && ev.targetId) {
        const meta = ev.metadata as {
          category?: string
          publisherId?: string
          tags?: string[] | string
          entities?: string[] | string
        } | null
        if (meta?.category) {
          const key = interestKey('cat', meta.category)
          interestScores.set(key, (interestScores.get(key) ?? 0) + delta * 0.6)
          const flat = meta.category.toLowerCase()
          interestScores.set(flat, (interestScores.get(flat) ?? 0) + delta * 0.3)
        }
        if (meta?.publisherId) {
          publisherScores.set(meta.publisherId, (publisherScores.get(meta.publisherId) ?? 0) + delta * 0.8)
        }
        // Always-on tag affinity: credit existing article tags with bounded multi-tag share.
        const rawTags = Array.isArray(meta?.tags)
          ? meta!.tags!
          : typeof meta?.tags === 'string'
            ? meta.tags.split(/[,;]+/)
            : []
        const tags = [
          ...new Set(
            rawTags
              .map((t) => (typeof t === 'string' ? t.trim().toLocaleLowerCase('tr-TR') : ''))
              .filter(Boolean)
          ),
        ].slice(0, 8)
        if (tags.length) {
          const perTag = (delta * 0.7) / Math.sqrt(tags.length)
          for (const tag of tags) {
            const key = interestKey('tag', tag)
            interestScores.set(key, (interestScores.get(key) ?? 0) + perTag)
            interestScores.set(tag, (interestScores.get(tag) ?? 0) + perTag * 0.5)
          }
        }
        // Entity affinity from explicit entities metadata (deterministic; no AI).
        const rawEnt = Array.isArray(meta?.entities)
          ? meta!.entities!
          : typeof meta?.entities === 'string'
            ? meta.entities.split(/[,;]+/)
            : []
        const entities = [
          ...new Set(
            rawEnt
              .map((t) => (typeof t === 'string' ? t.trim().toLocaleLowerCase('tr-TR') : ''))
              .filter(Boolean)
          ),
        ].slice(0, 6)
        if (entities.length) {
          const perEnt = (delta * 0.75) / Math.sqrt(entities.length)
          for (const ent of entities) {
            const key = interestKey('ent', ent)
            interestScores.set(key, (interestScores.get(key) ?? 0) + perEnt)
          }
        }
      } else if (ev.targetType === 'publisher' && ev.targetId) {
        publisherScores.set(ev.targetId, (publisherScores.get(ev.targetId) ?? 0) + delta)
      }
    }

    const now = new Date()
    for (const [key, score] of interestScores) {
      const normalized = Math.min(1, Math.max(0, score / 5))
      await db
        .insert(userInterestScores)
        .values({
          userId,
          interestKey: key,
          score: normalized,
          source: 'BEHAVIORAL',
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [userInterestScores.userId, userInterestScores.interestKey, userInterestScores.source],
          set: { score: normalized, updatedAt: now },
        })
    }

    for (const [publisherId, score] of publisherScores) {
      const normalized = Math.min(1, Math.max(0, score / 4))
      await db
        .insert(userPublisherAffinity)
        .values({ userId, publisherId, score: normalized, updatedAt: now })
        .onConflictDoUpdate({
          target: [userPublisherAffinity.userId, userPublisherAffinity.publisherId],
          set: { score: normalized, updatedAt: now },
        })
    }
  }

  async clearBehavioral(userId: string): Promise<void> {
    if (!hasDatabaseUrl()) return
    const db = getDb()
    await db
      .delete(userInterestScores)
      .where(and(eq(userInterestScores.userId, userId), eq(userInterestScores.source, 'BEHAVIORAL')))
    await db.delete(userPublisherAffinity).where(eq(userPublisherAffinity.userId, userId))
  }
}

export const feedInterestAggregator = new FeedInterestAggregator()
