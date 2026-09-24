import 'server-only'

import { FieldValue } from 'firebase-admin/firestore'
import { eq, or, sql } from 'drizzle-orm'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import {
  clampEngagementDwellMs,
  type ArticleEngagementSource,
} from '@/lib/feed/articleEngagement'

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

async function bumpFirestore(docId: string, viewDelta: number, dwellMs: number): Promise<void> {
  if (!viewDelta && !dwellMs) return
  const ref = getAdminFirestore().collection(Collections.NEWS).doc(docId)
  const update: Record<string, unknown> = {}
  if (viewDelta > 0) update.viewsCount = FieldValue.increment(viewDelta)
  if (dwellMs > 0) update.readDurationMs = FieldValue.increment(dwellMs)
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

async function bumpPostgres(pgId: string, viewDelta: number, dwellMs: number): Promise<void> {
  if (!hasDatabaseUrl() || (!viewDelta && !dwellMs)) return
  const db = getDb()
  try {
    if (viewDelta > 0 && dwellMs > 0) {
      await db
        .update(news)
        .set({
          viewsCount: sql`${news.viewsCount} + ${viewDelta}`,
          readDurationMs: sql`${news.readDurationMs} + ${dwellMs}`,
        })
        .where(eq(news.id, pgId))
      return
    }
    if (viewDelta > 0) {
      await db
        .update(news)
        .set({
          viewsCount: sql`${news.viewsCount} + ${viewDelta}`,
        })
        .where(eq(news.id, pgId))
    }
    if (dwellMs > 0) {
      await db
        .update(news)
        .set({
          readDurationMs: sql`${news.readDurationMs} + ${dwellMs}`,
        })
        .where(eq(news.id, pgId))
    }
  } catch (err) {
    console.warn('[article-engagement] postgres bump failed', {
      pgId,
      err: err instanceof Error ? err.message : String(err),
    })
  }
}

export async function recordArticleEngagement(input: {
  articleKey: string
  source: ArticleEngagementSource
  dwellMs?: number
  countView: boolean
}): Promise<{ ok: true; viewsIncremented: boolean; dwellMs: number; source: ArticleEngagementSource }> {
  const key = input.articleKey.trim()
  const dwellMs = clampEngagementDwellMs(input.dwellMs ?? 0)
  const viewDelta = input.countView ? 1 : 0
  if (!key || (!viewDelta && !dwellMs)) {
    return { ok: true, viewsIncremented: false, dwellMs: 0, source: input.source }
  }

  const pg = await lookupPgNews(key).catch(() => null)
  const firestoreId = pg?.legacyFirestoreId || (pg ? null : key)
  const pgId = pg?.id ?? null

  await Promise.all([
    pgId ? bumpPostgres(pgId, viewDelta, dwellMs) : Promise.resolve(),
    firestoreId ? bumpFirestore(firestoreId, viewDelta, dwellMs) : Promise.resolve(),
    // PG-native rows may share the same id as Firestore.
    !firestoreId && pgId ? bumpFirestore(pgId, viewDelta, dwellMs) : Promise.resolve(),
  ])

  return {
    ok: true,
    viewsIncremented: viewDelta > 0,
    dwellMs,
    source: input.source,
  }
}
