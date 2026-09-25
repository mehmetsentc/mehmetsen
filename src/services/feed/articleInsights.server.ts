import 'server-only'

import { and, desc, eq, gte, or } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { articleWatchSessions } from '@/db/schema/articleWatch'
import { users } from '@/db/schema/users'
import {
  ARTICLE_WATCH_RETENTION_DAYS,
  averageDurationMs,
  type ArticleWatchSurface,
} from '@/lib/feed/articleEngagement'

export type ArticleInsightSession = {
  id: string
  surface: ArticleWatchSurface
  actorLabel: string
  signedIn: boolean
  userId: string | null
  sessionHash: string | null
  viewCounted: boolean
  contentDwellMs: number
  pageDwellMs: number
  firstAt: string
  lastAt: string
}

export type ArticleInsightsDto = {
  articleId: string
  headline: string
  totals: {
    views: number
    likes: number
    comments: number
    saves: number
    shares: number
    contentDurationMs: number
    pageDurationMs: number
    watchSessionCount: number
    pageSessionCount: number
    avgContentDurationMs: number
    avgPageDurationMs: number
  }
  recentSessions: ArticleInsightSession[]
}

function asSurface(value: string): ArticleWatchSurface {
  if (value === 'feed' || value === 'story' || value === 'reader' || value === 'page') return value
  return 'reader'
}

export async function getArticleInsights(articleKey: string): Promise<ArticleInsightsDto | null> {
  if (!hasDatabaseUrl()) return null
  const key = articleKey.trim()
  if (!key) return null
  const db = getDb()

  const rows = await db
    .select({
      id: news.id,
      title: news.title,
      viewsCount: news.viewsCount,
      likesCount: news.likesCount,
      commentsCount: news.commentsCount,
      savesCount: news.savesCount,
      sharesCount: news.sharesCount,
      readDurationMs: news.readDurationMs,
      pageDurationMs: news.pageDurationMs,
      watchSessionCount: news.watchSessionCount,
      pageSessionCount: news.pageSessionCount,
    })
    .from(news)
    .where(or(eq(news.id, key), eq(news.legacyFirestoreId, key), eq(news.slug, key)))
    .limit(1)

  const article = rows[0]
  if (!article) return null

  const since = new Date(Date.now() - ARTICLE_WATCH_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  const sessions = await db
    .select({
      id: articleWatchSessions.id,
      surface: articleWatchSessions.surface,
      userId: articleWatchSessions.userId,
      sessionHash: articleWatchSessions.sessionHash,
      viewCounted: articleWatchSessions.viewCounted,
      contentDwellMs: articleWatchSessions.contentDwellMs,
      pageDwellMs: articleWatchSessions.pageDwellMs,
      firstAt: articleWatchSessions.firstAt,
      lastAt: articleWatchSessions.lastAt,
      displayName: users.displayName,
      username: users.username,
    })
    .from(articleWatchSessions)
    .leftJoin(users, eq(users.firebaseUid, articleWatchSessions.userId))
    .where(
      and(eq(articleWatchSessions.articleId, article.id), gte(articleWatchSessions.lastAt, since))
    )
    .orderBy(desc(articleWatchSessions.lastAt))
    .limit(40)

  return {
    articleId: article.id,
    headline: article.title,
    totals: {
      views: article.viewsCount ?? 0,
      likes: article.likesCount ?? 0,
      comments: article.commentsCount ?? 0,
      saves: article.savesCount ?? 0,
      shares: article.sharesCount ?? 0,
      contentDurationMs: article.readDurationMs ?? 0,
      pageDurationMs: article.pageDurationMs ?? 0,
      watchSessionCount: article.watchSessionCount ?? 0,
      pageSessionCount: article.pageSessionCount ?? 0,
      avgContentDurationMs: averageDurationMs(
        article.readDurationMs ?? 0,
        article.watchSessionCount ?? 0
      ),
      avgPageDurationMs: averageDurationMs(
        article.pageDurationMs ?? 0,
        article.pageSessionCount ?? 0
      ),
    },
    recentSessions: sessions.map((row) => {
      const signedIn = Boolean(row.userId)
      const name = row.displayName?.trim() || row.username?.trim() || ''
      const hashShort = row.sessionHash ? row.sessionHash.slice(0, 6) : ''
      const actorLabel = signedIn
        ? name || `Üye · ${(row.userId ?? '').slice(0, 8)}`
        : hashShort
          ? `Misafir · ${hashShort}`
          : 'Misafir'
      return {
        id: row.id,
        surface: asSurface(row.surface),
        actorLabel,
        signedIn,
        userId: row.userId,
        sessionHash: row.sessionHash ? row.sessionHash.slice(0, 8) : null,
        viewCounted: (row.viewCounted ?? 0) > 0,
        contentDwellMs: row.contentDwellMs ?? 0,
        pageDwellMs: row.pageDwellMs ?? 0,
        firstAt: row.firstAt.toISOString(),
        lastAt: row.lastAt.toISOString(),
      }
    }),
  }
}
