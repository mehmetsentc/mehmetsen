import 'server-only'

import { and, count, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import { randomUUID } from 'crypto'
import { getDb, hasDatabaseUrl } from '@/db'
import {
  articleComments,
  articleLikes,
  savedArticles,
  userProfiles,
  userPublisherFollows,
} from '@/db/schema/socialGraph'
import { news, users } from '@/db/schema'
import { publishers, publisherSources } from '@/db/schema/publishers'
import { recordSocialEvent } from '@/lib/social/events'
import { canChangeUsername, validateUsername } from '@/lib/social/username'
import type {
  CommentStatus,
  PaginatedResult,
  PublicUserProfile,
} from '@/types/socialGraph'

function requireDb() {
  if (!hasDatabaseUrl()) throw new Error('DATABASE_URL not configured')
  return getDb()
}

async function ensureUser(firebaseUid: string, email?: string | null): Promise<void> {
  const db = requireDb()
  const normalizedEmail = email?.trim().toLowerCase() || null
  const displayName = normalizedEmail ? normalizedEmail.split('@')[0]?.slice(0, 100) || null : null
  await db
    .insert(users)
    .values({ firebaseUid, email: normalizedEmail, displayName, role: 'user' })
    .onConflictDoNothing()
}

function sanitizeCommentContent(raw: string): string {
  return raw.replace(/<[^>]*>/g, '').trim().slice(0, 2000)
}

export class SocialGraphRepository {
  async resolvePublisherId(idOrSourceId: string): Promise<string> {
    if (!idOrSourceId.startsWith('src_')) return idOrSourceId
    try {
      const db = requireDb()
      const link = await db
        .select({ publisherId: publisherSources.publisherId })
        .from(publisherSources)
        .where(eq(publisherSources.sourceId, idOrSourceId))
        .limit(1)
      return link[0]?.publisherId ?? idOrSourceId
    } catch {
      return idOrSourceId
    }
  }

  async followPublisher(userId: string, publisherId: string, email?: string | null): Promise<boolean> {
    await ensureUser(userId, email)
    const db = requireDb()
    const resolvedPublisherId = await this.resolvePublisherId(publisherId)
    const pub = await db.select({ id: publishers.id }).from(publishers).where(eq(publishers.id, resolvedPublisherId)).limit(1)
    if (!pub.length) throw new Error('PUBLISHER_NOT_FOUND')

    const inserted = await db
      .insert(userPublisherFollows)
      .values({ userId, publisherId: resolvedPublisherId })
      .onConflictDoNothing()
      .returning({ userId: userPublisherFollows.userId })

    if (inserted.length > 0) {
      await recordSocialEvent({
        eventType: 'publisher_followed',
        userId,
        targetType: 'publisher',
        targetId: resolvedPublisherId,
      })
      return true
    }
    return false
  }

  async unfollowPublisher(userId: string, publisherId: string): Promise<boolean> {
    const db = requireDb()
    const resolvedPublisherId = await this.resolvePublisherId(publisherId)
    const deleted = await db
      .delete(userPublisherFollows)
      .where(and(eq(userPublisherFollows.userId, userId), eq(userPublisherFollows.publisherId, resolvedPublisherId)))
      .returning({ userId: userPublisherFollows.userId })

    if (deleted.length > 0) {
      await recordSocialEvent({
        eventType: 'publisher_unfollowed',
        userId,
        targetType: 'publisher',
        targetId: resolvedPublisherId,
      })
      return true
    }
    return false
  }

  async isFollowingPublisher(userId: string, publisherId: string): Promise<boolean> {
    const db = requireDb()
    const resolvedPublisherId = await this.resolvePublisherId(publisherId)
    const rows = await db
      .select({ userId: userPublisherFollows.userId })
      .from(userPublisherFollows)
      .where(and(eq(userPublisherFollows.userId, userId), eq(userPublisherFollows.publisherId, resolvedPublisherId)))
      .limit(1)
    return rows.length > 0
  }

  async getPublisherFollowerCount(publisherId: string): Promise<number> {
    const db = requireDb()
    const resolvedPublisherId = await this.resolvePublisherId(publisherId)
    const rows = await db
      .select({ c: count() })
      .from(userPublisherFollows)
      .where(eq(userPublisherFollows.publisherId, resolvedPublisherId))
    return Number(rows[0]?.c ?? 0)
  }

  async likeArticle(userId: string, articleId: string, email?: string | null): Promise<boolean> {
    await ensureUser(userId, email)
    const db = requireDb()
    const article = await db.select({ id: news.id }).from(news).where(eq(news.id, articleId)).limit(1)
    if (!article.length) throw new Error('ARTICLE_NOT_FOUND')

    const inserted = await db
      .insert(articleLikes)
      .values({ userId, articleId })
      .onConflictDoNothing()
      .returning({ userId: articleLikes.userId })

    if (inserted.length > 0) {
      await db.update(news).set({ likesCount: sql`${news.likesCount} + 1` }).where(eq(news.id, articleId))
      await recordSocialEvent({ eventType: 'article_liked', userId, targetType: 'article', targetId: articleId })
      return true
    }
    return false
  }

  async unlikeArticle(userId: string, articleId: string): Promise<boolean> {
    const db = requireDb()
    const deleted = await db
      .delete(articleLikes)
      .where(and(eq(articleLikes.userId, userId), eq(articleLikes.articleId, articleId)))
      .returning({ userId: articleLikes.userId })

    if (deleted.length > 0) {
      await db
        .update(news)
        .set({ likesCount: sql`GREATEST(${news.likesCount} - 1, 0)` })
        .where(eq(news.id, articleId))
      await recordSocialEvent({ eventType: 'article_unliked', userId, targetType: 'article', targetId: articleId })
      return true
    }
    return false
  }

  async saveArticle(userId: string, articleId: string, email?: string | null): Promise<boolean> {
    await ensureUser(userId, email)
    const db = requireDb()
    const article = await db.select({ id: news.id }).from(news).where(eq(news.id, articleId)).limit(1)
    if (!article.length) throw new Error('ARTICLE_NOT_FOUND')

    const inserted = await db
      .insert(savedArticles)
      .values({ userId, articleId })
      .onConflictDoNothing()
      .returning({ userId: savedArticles.userId })

    if (inserted.length > 0) {
      await db.update(news).set({ savesCount: sql`${news.savesCount} + 1` }).where(eq(news.id, articleId))
      await recordSocialEvent({ eventType: 'article_saved', userId, targetType: 'article', targetId: articleId })
      return true
    }
    return false
  }

  async unsaveArticle(userId: string, articleId: string): Promise<boolean> {
    const db = requireDb()
    const deleted = await db
      .delete(savedArticles)
      .where(and(eq(savedArticles.userId, userId), eq(savedArticles.articleId, articleId)))
      .returning({ userId: savedArticles.userId })

    if (deleted.length > 0) {
      await db
        .update(news)
        .set({ savesCount: sql`GREATEST(${news.savesCount} - 1, 0)` })
        .where(eq(news.id, articleId))
      await recordSocialEvent({ eventType: 'article_unsaved', userId, targetType: 'article', targetId: articleId })
      return true
    }
    return false
  }

  async isArticleLiked(userId: string, articleId: string): Promise<boolean> {
    const db = requireDb()
    const rows = await db
      .select({ userId: articleLikes.userId })
      .from(articleLikes)
      .where(and(eq(articleLikes.userId, userId), eq(articleLikes.articleId, articleId)))
      .limit(1)
    return rows.length > 0
  }

  async isArticleSaved(userId: string, articleId: string): Promise<boolean> {
    const db = requireDb()
    const rows = await db
      .select({ userId: savedArticles.userId })
      .from(savedArticles)
      .where(and(eq(savedArticles.userId, userId), eq(savedArticles.articleId, articleId)))
      .limit(1)
    return rows.length > 0
  }

  async getArticleCounts(articleId: string): Promise<{ likeCount: number; commentCount: number }> {
    const db = requireDb()
    const rows = await db
      .select({ likesCount: news.likesCount, commentsCount: news.commentsCount })
      .from(news)
      .where(eq(news.id, articleId))
      .limit(1)
    return {
      likeCount: Number(rows[0]?.likesCount ?? 0),
      commentCount: Number(rows[0]?.commentsCount ?? 0),
    }
  }

  async recordShare(userId: string | null, articleId: string): Promise<void> {
    const db = requireDb()
    const article = await db.select({ id: news.id }).from(news).where(eq(news.id, articleId)).limit(1)
    if (!article.length) throw new Error('ARTICLE_NOT_FOUND')
    await db.update(news).set({ sharesCount: sql`${news.sharesCount} + 1` }).where(eq(news.id, articleId))
    await recordSocialEvent({
      eventType: 'article_shared',
      userId,
      targetType: 'article',
      targetId: articleId,
    })
  }

  async createComment(input: {
    userId: string
    articleId: string
    content: string
    parentId?: string | null
    email?: string | null
  }): Promise<{ id: string }> {
    await ensureUser(input.userId, input.email)
    const content = sanitizeCommentContent(input.content)
    if (content.length < 1) throw new Error('COMMENT_EMPTY')

    const db = requireDb()
    const article = await db.select({ id: news.id }).from(news).where(eq(news.id, input.articleId)).limit(1)
    if (!article.length) throw new Error('ARTICLE_NOT_FOUND')

    if (input.parentId) {
      const parent = await db
        .select({ id: articleComments.id, articleId: articleComments.articleId })
        .from(articleComments)
        .where(eq(articleComments.id, input.parentId))
        .limit(1)
      if (!parent.length || parent[0]!.articleId !== input.articleId) {
        throw new Error('PARENT_COMMENT_INVALID')
      }
    }

    const id = randomUUID()
    await db.insert(articleComments).values({
      id,
      articleId: input.articleId,
      userId: input.userId,
      parentId: input.parentId ?? null,
      content,
      status: 'VISIBLE',
    })
    await db
      .update(news)
      .set({ commentsCount: sql`${news.commentsCount} + 1` })
      .where(eq(news.id, input.articleId))
    await recordSocialEvent({
      eventType: 'comment_created',
      userId: input.userId,
      targetType: 'article',
      targetId: input.articleId,
      metadata: { commentId: id },
    })
    return { id }
  }

  async deleteComment(userId: string, commentId: string): Promise<boolean> {
    const db = requireDb()
    const rows = await db
      .select()
      .from(articleComments)
      .where(eq(articleComments.id, commentId))
      .limit(1)
    const comment = rows[0]
    if (!comment || comment.userId !== userId) return false
    if (comment.status === 'DELETED') return false

    await db
      .update(articleComments)
      .set({ status: 'DELETED' as CommentStatus, updatedAt: new Date() })
      .where(eq(articleComments.id, commentId))
    await db
      .update(news)
      .set({ commentsCount: sql`GREATEST(${news.commentsCount} - 1, 0)` })
      .where(eq(news.id, comment.articleId))
    return true
  }

  async listComments(articleId: string, limit = 30, cursor?: string | null) {
    const db = requireDb()
    const conditions = [eq(articleComments.articleId, articleId), eq(articleComments.status, 'VISIBLE')]
    if (cursor) {
      conditions.push(lt(articleComments.createdAt, new Date(cursor)))
    }
    const rows = await db
      .select({
        id: articleComments.id,
        articleId: articleComments.articleId,
        userId: articleComments.userId,
        parentId: articleComments.parentId,
        content: articleComments.content,
        createdAt: articleComments.createdAt,
        username: userProfiles.username,
        displayName: userProfiles.displayName,
        avatarUrl: userProfiles.avatarUrl,
      })
      .from(articleComments)
      .leftJoin(userProfiles, eq(articleComments.userId, userProfiles.firebaseUid))
      .where(and(...conditions))
      .orderBy(desc(articleComments.createdAt))
      .limit(limit + 1)

    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      articleId: r.articleId,
      userId: r.userId,
      parentId: r.parentId,
      content: r.content,
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
      author: {
        username: r.username ?? 'kullanici',
        displayName: r.displayName ?? 'Kullanıcı',
        avatarUrl: r.avatarUrl ?? null,
      },
    }))
    const nextCursor = hasMore ? items[items.length - 1]?.createdAt ?? null : null
    return { items, nextCursor, hasMore }
  }

  async upsertProfile(input: {
    firebaseUid: string
    username?: string
    displayName?: string
    avatarUrl?: string | null
    bio?: string | null
    city?: string | null
    country?: string | null
    interests?: string[]
    email?: string | null
  }): Promise<void> {
    await ensureUser(input.firebaseUid, input.email)
    const db = requireDb()

    let normalizedUsername: string | undefined
    if (input.username) {
      const validated = validateUsername(input.username)
      if (!validated.ok) throw new Error(validated.error)
      normalizedUsername = validated.username
      const existing = await db
        .select({ firebaseUid: userProfiles.firebaseUid, usernameChangedAt: userProfiles.usernameChangedAt })
        .from(userProfiles)
        .where(eq(userProfiles.firebaseUid, input.firebaseUid))
        .limit(1)
      const taken = await db
        .select({ firebaseUid: userProfiles.firebaseUid })
        .from(userProfiles)
        .where(eq(userProfiles.username, normalizedUsername))
        .limit(1)
      if (taken.length && taken[0]!.firebaseUid !== input.firebaseUid) {
        throw new Error('USERNAME_TAKEN')
      }
      if (existing.length && existing[0]!.usernameChangedAt && !canChangeUsername(existing[0]!.usernameChangedAt)) {
        throw new Error('USERNAME_RATE_LIMIT')
      }
    }

    await db
      .insert(userProfiles)
      .values({
        firebaseUid: input.firebaseUid,
        username: normalizedUsername,
        displayName: input.displayName,
        avatarUrl: input.avatarUrl ?? null,
        bio: input.bio ?? null,
        city: input.city ?? null,
        country: input.country ?? null,
        interests: input.interests ?? [],
        usernameChangedAt: normalizedUsername ? new Date() : undefined,
      })
      .onConflictDoUpdate({
        target: userProfiles.firebaseUid,
        set: {
          ...(normalizedUsername ? { username: normalizedUsername, usernameChangedAt: new Date() } : {}),
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
          ...(input.bio !== undefined ? { bio: input.bio } : {}),
          ...(input.city !== undefined ? { city: input.city } : {}),
          ...(input.country !== undefined ? { country: input.country } : {}),
          ...(input.interests !== undefined ? { interests: input.interests } : {}),
          updatedAt: new Date(),
        },
      })

    if (normalizedUsername || input.displayName) {
      await db
        .update(users)
        .set({
          ...(normalizedUsername ? { username: normalizedUsername } : {}),
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          ...(input.avatarUrl !== undefined ? { photoUrl: input.avatarUrl } : {}),
          updatedAt: new Date(),
        })
        .where(eq(users.firebaseUid, input.firebaseUid))
    }
  }

  async getPublicProfileByUsername(username: string): Promise<PublicUserProfile | null> {
    const validated = validateUsername(username)
    if (!validated.ok) return null
    const db = requireDb()
    const rows = await db
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.username, validated.username))
      .limit(1)
    const profile = rows[0]
    if (!profile || profile.profileVisibility === 'PRIVATE') return null

    const followCount = await db
      .select({ c: count() })
      .from(userPublisherFollows)
      .where(eq(userPublisherFollows.userId, profile.firebaseUid))

    return {
      userId: profile.firebaseUid,
      username: profile.username ?? validated.username,
      displayName: profile.displayName ?? profile.username ?? 'Kullanıcı',
      avatarUrl: profile.avatarUrl ?? null,
      bio: profile.bio ?? null,
      city: profile.city ?? null,
      country: profile.country ?? null,
      followedPublisherCount: Number(followCount[0]?.c ?? 0),
      profileVisibility: (profile.profileVisibility as PublicUserProfile['profileVisibility']) ?? 'PUBLIC',
    }
  }

  async listSavedArticles(
    ownerUserId: string,
    viewerUserId: string | null,
    limit = 20,
    cursor?: string | null
  ): Promise<PaginatedResult<{ articleId: string; createdAt: string }>> {
    if (ownerUserId !== viewerUserId) {
      return { items: [], nextCursor: null, hasMore: false }
    }
    const db = requireDb()
    const conditions = [eq(savedArticles.userId, ownerUserId)]
    if (cursor) conditions.push(lt(savedArticles.createdAt, new Date(cursor)))
    const rows = await db
      .select({ articleId: savedArticles.articleId, createdAt: savedArticles.createdAt })
      .from(savedArticles)
      .where(and(...conditions))
      .orderBy(desc(savedArticles.createdAt))
      .limit(limit + 1)
    const hasMore = rows.length > limit
    const items = rows.slice(0, limit).map((r) => ({
      articleId: r.articleId,
      createdAt: r.createdAt?.toISOString() ?? new Date().toISOString(),
    }))
    return { items, nextCursor: hasMore ? items[items.length - 1]?.createdAt ?? null : null, hasMore }
  }

  async batchArticleState(userId: string | null, articleIds: string[]) {
    if (!articleIds.length) return []
    const db = requireDb()
    const counts = await db
      .select({ id: news.id, likesCount: news.likesCount, commentsCount: news.commentsCount })
      .from(news)
      .where(inArray(news.id, articleIds))

    let likedSet = new Set<string>()
    let savedSet = new Set<string>()
    if (userId) {
      const liked = await db
        .select({ articleId: articleLikes.articleId })
        .from(articleLikes)
        .where(and(eq(articleLikes.userId, userId), inArray(articleLikes.articleId, articleIds)))
      likedSet = new Set(liked.map((r) => r.articleId))
      const saved = await db
        .select({ articleId: savedArticles.articleId })
        .from(savedArticles)
        .where(and(eq(savedArticles.userId, userId), inArray(savedArticles.articleId, articleIds)))
      savedSet = new Set(saved.map((r) => r.articleId))
    }

    return counts.map((c) => ({
      articleId: c.id,
      liked: likedSet.has(c.id),
      saved: savedSet.has(c.id),
      likeCount: Number(c.likesCount ?? 0),
      commentCount: Number(c.commentsCount ?? 0),
    }))
  }

  async batchPublisherFollowState(userId: string | null, publisherIds: string[]) {
    if (!publisherIds.length) return []
    const db = requireDb()
    const resolvedIdsMap = new Map<string, string>()
    await Promise.all(
      publisherIds.map(async (id) => {
        const resolved = await this.resolvePublisherId(id)
        resolvedIdsMap.set(id, resolved)
      })
    )
    const counts = await Promise.all(
      publisherIds.map(async (publisherId) => ({
        publisherId,
        followerCount: await this.getPublisherFollowerCount(publisherId),
      }))
    )
    let followingSet = new Set<string>()
    if (userId) {
      const allTargetIds = [...new Set([...publisherIds, ...resolvedIdsMap.values()])]
      const rows = await db
        .select({ publisherId: userPublisherFollows.publisherId })
        .from(userPublisherFollows)
        .where(and(eq(userPublisherFollows.userId, userId), inArray(userPublisherFollows.publisherId, allTargetIds)))
      followingSet = new Set(rows.map((r) => r.publisherId))
    }
    return counts.map((c) => {
      const resolved = resolvedIdsMap.get(c.publisherId) ?? c.publisherId
      return {
        publisherId: c.publisherId,
        following: followingSet.has(c.publisherId) || followingSet.has(resolved),
        followerCount: c.followerCount,
      }
    })
  }
}

export const socialGraphRepository = new SocialGraphRepository()
