import 'server-only'

import { createHash, randomUUID } from 'node:crypto'
import { FieldValue } from 'firebase-admin/firestore'
import { and, eq, or, sql } from 'drizzle-orm'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { articleWatchSessions } from '@/db/schema/articleWatch'
import {
  applyWatchSessionWrite,
  clampEngagementDwellMs,
  engagementSourceToSurface,
  watchActorKey,
  type ArticleEngagementSource,
} from '@/lib/feed/articleEngagement'

function hashOpaque(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 32)
}

export function hashWatchSessionId(sessionId: string | null | undefined): string | null {
  const raw = typeof sessionId === 'string' ? sessionId.trim() : ''
  if (!raw || raw.length < 8 || raw.length > 80 || !/^[\w-]+$/.test(raw)) return null
  return hashOpaque(raw)
}

function fallbackGuestHash(ip: string | null | undefined, userAgent: string | null | undefined): string | null {
  const seed = `${ip?.trim() || ''}|${userAgent?.trim() || ''}`.trim()
  if (seed === '|' || !seed.replace(/\|/g, '')) return null
  return hashOpaque(`ip:${seed}`)
}

async function lookupPgNews(key: string): Promise<{
  id: string
  legacyFirestoreId: string | null
} | null> {
  if (!hasDatabaseUrl()) return null
  const db = getDb()
  const rows = await db
    .select({ id: news.id, legacyFirestoreId: news.legacyFirestoreId })
    .from(news)
    .where(or(eq(news.id, key), eq(news.legacyFirestoreId, key), eq(news.slug, key)))
    .limit(1)
  return rows[0] ?? null
}

type CounterDeltas = {
  viewDelta: number
  contentDelta: number
  pageDelta: number
  watchSessionDelta: number
  pageSessionDelta: number
}

function hasCounterWork(d: CounterDeltas): boolean {
  return (
    d.viewDelta > 0 ||
    d.contentDelta > 0 ||
    d.pageDelta > 0 ||
    d.watchSessionDelta > 0 ||
    d.pageSessionDelta > 0
  )
}

async function bumpFirestore(docId: string, d: CounterDeltas): Promise<void> {
  if (!hasCounterWork(d)) return
  const ref = getAdminFirestore().collection(Collections.NEWS).doc(docId)
  const update: Record<string, unknown> = {}
  if (d.viewDelta > 0) update.viewsCount = FieldValue.increment(d.viewDelta)
  if (d.contentDelta > 0) update.readDurationMs = FieldValue.increment(d.contentDelta)
  if (d.pageDelta > 0) update.pageDurationMs = FieldValue.increment(d.pageDelta)
  if (d.watchSessionDelta > 0) update.watchSessionCount = FieldValue.increment(d.watchSessionDelta)
  if (d.pageSessionDelta > 0) update.pageSessionCount = FieldValue.increment(d.pageSessionDelta)
  try {
    await ref.update(update)
  } catch (error) {
    const err = error as { code?: number | string; message?: string }
    const missing =
      err.code === 5 ||
      err.code === 'not-found' ||
      /NOT_FOUND|No document to update/i.test(err.message ?? '')
    if (!missing) {
      console.warn('[article-engagement] firestore bump failed', {
        docId,
        err: err.message,
      })
    }
  }
}

async function bumpPostgres(pgId: string, d: CounterDeltas): Promise<void> {
  if (!hasDatabaseUrl() || !hasCounterWork(d)) return
  const db = getDb()
  const set: Record<string, unknown> = {}
  if (d.viewDelta > 0) set.viewsCount = sql`${news.viewsCount} + ${d.viewDelta}`
  if (d.contentDelta > 0) set.readDurationMs = sql`${news.readDurationMs} + ${d.contentDelta}`
  if (d.pageDelta > 0) set.pageDurationMs = sql`${news.pageDurationMs} + ${d.pageDelta}`
  if (d.watchSessionDelta > 0) {
    set.watchSessionCount = sql`${news.watchSessionCount} + ${d.watchSessionDelta}`
  }
  if (d.pageSessionDelta > 0) {
    set.pageSessionCount = sql`${news.pageSessionCount} + ${d.pageSessionDelta}`
  }
  try {
    await db.update(news).set(set).where(eq(news.id, pgId))
  } catch (err) {
    console.warn('[article-engagement] postgres bump failed', {
      pgId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

async function upsertWatchSession(input: {
  articleId: string
  actorKey: string
  userId: string | null
  sessionHash: string | null
  surface: ReturnType<typeof engagementSourceToSurface>
  dwellMs: number
  countView: boolean
}): Promise<CounterDeltas> {
  const empty: CounterDeltas = {
    viewDelta: 0,
    contentDelta: 0,
    pageDelta: 0,
    watchSessionDelta: 0,
    pageSessionDelta: 0,
  }
  if (!hasDatabaseUrl()) return empty
  const db = getDb()

  const loadExisting = async () => {
    const rows = await db
      .select({
        id: articleWatchSessions.id,
        viewCounted: articleWatchSessions.viewCounted,
      })
      .from(articleWatchSessions)
      .where(
        and(
          eq(articleWatchSessions.articleId, input.articleId),
          eq(articleWatchSessions.actorKey, input.actorKey),
          eq(articleWatchSessions.surface, input.surface)
        )
      )
      .limit(1)
    return rows[0] ?? null
  }

  let existing = await loadExisting().catch(() => null)
  const write = applyWatchSessionWrite({
    existing: existing ? { viewCounted: existing.viewCounted > 0 } : null,
    surface: input.surface,
    dwellDeltaMs: input.dwellMs,
    countView: input.countView,
  })

  if (!write.isNew && !write.viewDelta && !write.contentDelta && !write.pageDelta) {
    return empty
  }

  try {
    if (!existing) {
      await db.insert(articleWatchSessions).values({
        id: randomUUID(),
        articleId: input.articleId,
        actorKey: input.actorKey,
        userId: input.userId,
        sessionHash: input.sessionHash,
        surface: input.surface,
        viewCounted: write.nextViewCounted ? 1 : 0,
        contentDwellMs: write.contentDelta,
        pageDwellMs: write.pageDelta,
      })
    } else {
      const set: Record<string, unknown> = {
        lastAt: sql`now()`,
      }
      if (input.userId) set.userId = input.userId
      if (write.nextViewCounted) set.viewCounted = 1
      if (write.contentDelta > 0) {
        set.contentDwellMs = sql`${articleWatchSessions.contentDwellMs} + ${write.contentDelta}`
      }
      if (write.pageDelta > 0) {
        set.pageDwellMs = sql`${articleWatchSessions.pageDwellMs} + ${write.pageDelta}`
      }
      await db
        .update(articleWatchSessions)
        .set(set)
        .where(eq(articleWatchSessions.id, existing.id))
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const conflict = /unique|duplicate/i.test(message)
    if (!conflict) {
      console.warn('[article-engagement] session upsert failed', { err: message })
      return empty
    }
    existing = await loadExisting().catch(() => null)
    const retry = applyWatchSessionWrite({
      existing: existing ? { viewCounted: existing.viewCounted > 0 } : null,
      surface: input.surface,
      dwellDeltaMs: input.dwellMs,
      countView: input.countView,
    })
    if (existing && (retry.viewDelta || retry.contentDelta || retry.pageDelta)) {
      const set: Record<string, unknown> = { lastAt: sql`now()` }
      if (input.userId) set.userId = input.userId
      if (retry.nextViewCounted) set.viewCounted = 1
      if (retry.contentDelta > 0) {
        set.contentDwellMs = sql`${articleWatchSessions.contentDwellMs} + ${retry.contentDelta}`
      }
      if (retry.pageDelta > 0) {
        set.pageDwellMs = sql`${articleWatchSessions.pageDwellMs} + ${retry.pageDelta}`
      }
      await db
        .update(articleWatchSessions)
        .set(set)
        .where(eq(articleWatchSessions.id, existing.id))
        .catch(() => {})
    }
    return {
      viewDelta: retry.viewDelta,
      contentDelta: retry.contentDelta,
      pageDelta: retry.pageDelta,
      watchSessionDelta: retry.watchSessionDelta,
      pageSessionDelta: retry.pageSessionDelta,
    }
  }

  return {
    viewDelta: write.viewDelta,
    contentDelta: write.contentDelta,
    pageDelta: write.pageDelta,
    watchSessionDelta: write.watchSessionDelta,
    pageSessionDelta: write.pageSessionDelta,
  }
}

export async function recordArticleEngagement(input: {
  articleKey: string
  source: ArticleEngagementSource
  dwellMs?: number
  countView: boolean
  userId?: string | null
  sessionId?: string | null
  clientIp?: string | null
  userAgent?: string | null
}): Promise<{
  ok: true
  viewsIncremented: boolean
  dwellMs: number
  source: ArticleEngagementSource
}> {
  const key = input.articleKey.trim()
  const dwellMs = clampEngagementDwellMs(input.dwellMs ?? 0)
  const countView = input.countView === true
  if (!key || (!countView && !dwellMs)) {
    return { ok: true, viewsIncremented: false, dwellMs: 0, source: input.source }
  }

  const pg = await lookupPgNews(key).catch(() => null)
  const firestoreId = pg?.legacyFirestoreId || (pg ? null : key)
  const pgId = pg?.id ?? null
  const surface = engagementSourceToSurface(input.source)
  const sessionHash =
    hashWatchSessionId(input.sessionId) || fallbackGuestHash(input.clientIp, input.userAgent)
  const userId = input.userId?.trim() || null
  const actorKey = watchActorKey(userId, sessionHash)

  let deltas: CounterDeltas = {
    viewDelta: countView ? 1 : 0,
    contentDelta: surface === 'page' ? 0 : dwellMs,
    pageDelta: surface === 'page' ? dwellMs : 0,
    watchSessionDelta: 0,
    pageSessionDelta: 0,
  }

  if (pgId && actorKey) {
    const sessionDeltas = await upsertWatchSession({
      articleId: pgId,
      actorKey,
      userId,
      sessionHash,
      surface,
      dwellMs,
      countView,
    })
    deltas = sessionDeltas
  }

  await Promise.all([
    pgId ? bumpPostgres(pgId, deltas) : Promise.resolve(),
    firestoreId ? bumpFirestore(firestoreId, deltas) : Promise.resolve(),
    !firestoreId && pgId ? bumpFirestore(pgId, deltas) : Promise.resolve(),
  ])

  return {
    ok: true,
    viewsIncremented: deltas.viewDelta > 0,
    dwellMs,
    source: input.source,
  }
}
