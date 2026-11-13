import 'server-only'
import { eq, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { newsReadMirror } from '@/db/schema/newsReadMirror'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { toNewsMirrorRow, type NewsMirrorRow } from './newsMirrorRow'

export { toMirrorJson, toNewsMirrorRow } from './newsMirrorRow'
export type { NewsMirrorRow } from './newsMirrorRow'

/**
 * FinOps Neon migration, phase 1: keep `news_read_mirror` in step with Firestore `news`.
 *
 * Writes stay in Firestore. Each publish / edit / unpublish (every caller of
 * revalidatePublishedNews) mirrors that one article; the daily reconcile cron and
 * the one-off backfill script cover the rest. Nothing on the site reads the mirror
 * until the phase-2 read flags are on, so a mirror failure never affects readers.
 */

export function isNewsPgMirrorEnabled(): boolean {
  return process.env.NEWS_PG_MIRROR === '1' && hasDatabaseUrl()
}

export async function upsertNewsMirror(id: string, data: Record<string, unknown>): Promise<void> {
  const row = toNewsMirrorRow(id, data)
  const { id: _id, ...set } = row
  await getDb()
    .insert(newsReadMirror)
    .values(row)
    .onConflictDoUpdate({ target: newsReadMirror.id, set })
}

/** Batch upsert (backfill / reconcile). One INSERT … ON CONFLICT per call. */
export async function upsertNewsMirrorRows(rows: NewsMirrorRow[]): Promise<void> {
  if (rows.length === 0) return
  await getDb()
    .insert(newsReadMirror)
    .values(rows)
    .onConflictDoUpdate({
      target: newsReadMirror.id,
      set: {
        slug: sql`excluded.slug`,
        status: sql`excluded.status`,
        publishedAt: sql`excluded.published_at`,
        createdAt: sql`excluded.created_at`,
        updatedAt: sql`excluded.updated_at`,
        categoryId: sql`excluded.category_id`,
        citySlug: sql`excluded.city_slug`,
        districtSlug: sql`excluded.district_slug`,
        authorId: sql`excluded.author_id`,
        tags: sql`excluded.tags`,
        views: sql`excluded.views`,
        doc: sql`excluded.doc`,
        mirroredAt: sql`now()`,
      },
    })
}

const BACKFILL_KEY = 'backfill_cursor'

/** Backfill cursor: 'done', or `${publishedAtMs}|${docId}` of the last mirrored doc. */
export async function readBackfillCursor(): Promise<string | null> {
  const res = (await getDb().execute(
    sql`select value from news_read_mirror_state where key = ${BACKFILL_KEY}`
  )) as unknown as { rows?: { value: string }[] }
  return res.rows?.[0]?.value ?? null
}

export async function writeBackfillCursor(value: string): Promise<void> {
  await getDb().execute(
    sql`insert into news_read_mirror_state (key, value, updated_at) values (${BACKFILL_KEY}, ${value}, now())
        on conflict (key) do update set value = excluded.value, updated_at = now()`
  )
}

export async function deleteNewsMirror(id: string): Promise<void> {
  await getDb().delete(newsReadMirror).where(eq(newsReadMirror.id, id))
}

/**
 * Mirror one article by slug (falls back to treating the slug as a doc id).
 * A slug that no longer resolves deletes its mirror rows, so hard deletes and
 * slug renames do not leave stale public rows behind.
 */
export async function mirrorNewsBySlug(slug: string): Promise<'upserted' | 'deleted' | 'skipped'> {
  const s = slug.trim()
  if (!s || !isNewsPgMirrorEnabled()) return 'skipped'
  const col = getAdminFirestore().collection(Collections.NEWS)
  const snap = await col.where('slug', '==', s).limit(5).get()
  if (!snap.empty) {
    for (const d of snap.docs) await upsertNewsMirror(d.id, d.data())
    return 'upserted'
  }
  const byId = await col.doc(s).get()
  if (byId.exists) {
    await upsertNewsMirror(byId.id, byId.data() ?? {})
    return 'upserted'
  }
  await getDb().delete(newsReadMirror).where(eq(newsReadMirror.slug, s))
  return 'deleted'
}

/** Fire-and-forget hook for publish/edit/unpublish paths. Never throws. */
export function scheduleNewsMirror(slug: string | null | undefined): void {
  if (!slug || !isNewsPgMirrorEnabled()) return
  const run = () =>
    mirrorNewsBySlug(slug).catch((error) => {
      console.warn('[newsMirror] mirror failed for', slug, error instanceof Error ? error.message : error)
    })
  try {
    // Runs after the response inside a request; outside one, after() throws.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { after } = require('next/server') as typeof import('next/server')
    after(run)
  } catch {
    void run()
  }
}
