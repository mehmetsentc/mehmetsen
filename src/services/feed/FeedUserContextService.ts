import 'server-only'

import { and, eq, inArray } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { userProfiles, userPublisherFollows } from '@/db/schema/socialGraph'
import {
  userFeedPreferences,
  userInterestScores,
  userPublisherAffinity,
} from '@/db/schema/feedRanking'

import type { FeedUserContext } from '@/types/smartFeed'

export type { FeedUserContext }

const EMPTY_CONTEXT: FeedUserContext = {
  userId: null,
  isSynthetic: false,
  explicitInterests: [],
  behavioralInterests: new Map(),
  publisherAffinities: new Map(),
  followedPublisherIds: new Set(),
  negativePreferences: [],
  city: null,
  districtSlug: null,
}

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

export class FeedUserContextService {
  async load(userId: string | null): Promise<FeedUserContext> {
    if (!userId || !hasDatabaseUrl()) return { ...EMPTY_CONTEXT, userId }

    const db = requireDb()

    const [profile] = await db
      .select({
        interests: userProfiles.interests,
        city: userProfiles.city,
        actorType: userProfiles.actorType,
      })
      .from(userProfiles)
      .where(eq(userProfiles.firebaseUid, userId))
      .limit(1)

    if (profile?.actorType === 'SYNTHETIC_TEST') {
      return { ...EMPTY_CONTEXT, userId, isSynthetic: true }
    }

    const [interestRows, affinityRows, followRows, prefRows] = await Promise.all([
      db
        .select({ key: userInterestScores.interestKey, score: userInterestScores.score })
        .from(userInterestScores)
        .where(and(eq(userInterestScores.userId, userId), eq(userInterestScores.source, 'BEHAVIORAL'))),
      db
        .select({ publisherId: userPublisherAffinity.publisherId, score: userPublisherAffinity.score })
        .from(userPublisherAffinity)
        .where(eq(userPublisherAffinity.userId, userId)),
      db
        .select({ publisherId: userPublisherFollows.publisherId })
        .from(userPublisherFollows)
        .where(eq(userPublisherFollows.userId, userId)),
      db
        .select({
          preferenceType: userFeedPreferences.preferenceType,
          targetType: userFeedPreferences.targetType,
          targetId: userFeedPreferences.targetId,
          modifier: userFeedPreferences.modifier,
        })
        .from(userFeedPreferences)
        .where(eq(userFeedPreferences.userId, userId)),
    ])

    const behavioralInterests = new Map<string, number>()
    for (const row of interestRows) behavioralInterests.set(row.key, row.score)

    const publisherAffinities = new Map<string, number>()
    for (const row of affinityRows) publisherAffinities.set(row.publisherId, row.score)

    return {
      userId,
      isSynthetic: false,
      explicitInterests: Array.isArray(profile?.interests) ? profile.interests : [],
      behavioralInterests,
      publisherAffinities,
      followedPublisherIds: new Set(followRows.map((r) => r.publisherId)),
      negativePreferences: prefRows,
      city: profile?.city ?? null,
      districtSlug: null,
    }
  }

  async loadBatch(userIds: string[]): Promise<Map<string, FeedUserContext>> {
    const map = new Map<string, FeedUserContext>()
    await Promise.all(
      userIds.map(async (uid) => {
        map.set(uid, await this.load(uid))
      })
    )
    return map
  }

  isPublisherFollowed(ctx: FeedUserContext, publisherId: string | null): boolean {
    if (!publisherId) return false
    return ctx.followedPublisherIds.has(publisherId)
  }

  hasNegativePreference(
    ctx: FeedUserContext,
    opts: { articleId?: string; publisherId?: string | null; category?: string | null }
  ): boolean {
    for (const pref of ctx.negativePreferences) {
      if (pref.targetType === 'article' && opts.articleId && pref.targetId === opts.articleId) return true
      if (pref.targetType === 'publisher' && opts.publisherId && pref.targetId === opts.publisherId) return true
      if (pref.targetType === 'category' && opts.category && pref.targetId === opts.category.toLowerCase()) return true
    }
    return false
  }

  interestScore(ctx: FeedUserContext, category: string | null): number {
    const cat = (category ?? '').trim().toLowerCase()
    if (!cat) return 0

    let score = 0
    for (const interest of ctx.explicitInterests) {
      const key = interest.trim().toLowerCase()
      if (key && (cat.includes(key) || key.includes(cat))) score = Math.max(score, 0.85)
    }
    const behavioral = ctx.behavioralInterests.get(cat) ?? 0
    return Math.min(1, Math.max(score, behavioral))
  }

  publisherAffinity(ctx: FeedUserContext, publisherId: string | null): number {
    if (!publisherId) return 0
    return Math.min(1, ctx.publisherAffinities.get(publisherId) ?? 0)
  }
}

export const feedUserContextService = new FeedUserContextService()
