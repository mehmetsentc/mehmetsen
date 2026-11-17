import 'server-only'
import { sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'

/**
 * FinOps Neon migration, phase 2: public reads from news_read_mirror.
 *
 * Each surface has its own flag so it can be switched on, measured and switched back
 * without a code change. Callers fall back to Firestore when a mirror read throws.
 * Live surfaces: sitemap (NEWS_PG_READ_SITEMAP, 15 Nov 2026); tag and author lists
 * (NEWS_PG_READ_TAG_AUTHOR, 17 Nov 2026).
 *
 * Parity rule: a mirror query returns exactly the documents the Firestore query it
 * replaces would return. Firestore range queries on `publishedAt` only match numeric
 * values (Timestamp-typed legacy docs sort in a different type bucket), so the
 * mirror queries filter on `jsonb_typeof(doc->'publishedAt') = 'number'` too.
 */

export type MirrorSurface = 'sitemap' | 'tagAuthor'

const FLAGS: Record<MirrorSurface, string> = {
  sitemap: 'NEWS_PG_READ_SITEMAP',
  tagAuthor: 'NEWS_PG_READ_TAG_AUTHOR',
}

export function isMirrorReadEnabled(surface: MirrorSurface): boolean {
  return process.env[FLAGS[surface]] === '1' && hasDatabaseUrl()
}

type Row = Record<string, unknown>

function rowsOf(res: unknown): Row[] {
  const r = res as { rows?: Row[] } | Row[]
  return Array.isArray(r) ? r : (r.rows ?? [])
}

/** jsonb_build_object('a', doc->'a', …) — only the fields a surface needs leave Neon. */
function pickFields(fields: readonly string[]) {
  const parts = fields.map((f) => {
    if (!/^[A-Za-z0-9_]+$/.test(f)) throw new Error(`bad field name: ${f}`)
    return sql.raw(`'${f}', doc->'${f}'`)
  })
  return sql`jsonb_build_object(${sql.join(parts, sql`, `)})`
}

/**
 * Same rows as the Firestore month scan in loadFirestoreMonthDocs:
 * status == 'published', numeric publishedAt in [startMs, upperMs), newest first.
 */
export async function loadMirrorMonthDocs(
  startMs: number,
  upperMs: number,
  fields: readonly string[]
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const res = await getDb().execute(sql`
    select id, ${pickFields(fields)} as data
    from news_read_mirror
    where status = 'published'
      and jsonb_typeof(doc->'publishedAt') = 'number'
      and (doc->>'publishedAt')::double precision >= ${startMs}
      and (doc->>'publishedAt')::double precision < ${upperMs}
    order by (doc->>'publishedAt')::double precision desc, id desc
  `)
  return rowsOf(res).map((r) => ({ id: String(r.id), data: (r.data ?? {}) as Record<string, unknown> }))
}

/** Non-empty months (YYYY-MM, UTC) with a numeric publishedAt below upperMs, newest first. */
export async function discoverMirrorMonths(upperMs: number): Promise<string[]> {
  const res = await getDb().execute(sql`
    select distinct to_char(to_timestamp((doc->>'publishedAt')::double precision / 1000) at time zone 'UTC', 'YYYY-MM') as month
    from news_read_mirror
    where status = 'published'
      and jsonb_typeof(doc->'publishedAt') = 'number'
      and (doc->>'publishedAt')::double precision < ${upperMs}
    order by month desc
  `)
  return rowsOf(res)
    .map((r) => String(r.month ?? ''))
    .filter((m) => /^\d{4}-\d{2}$/.test(m))
}

const MAX_LIST_LIMIT = 200

function clampLimit(limit: number): number {
  return Math.max(1, Math.min(MAX_LIST_LIMIT, Math.floor(limit)))
}

/**
 * Tag page list (replaces `status == published AND tags array-contains-any variants LIMIT n`).
 * Firestore returned an arbitrary n matches (document-id order) that the caller then sorted
 * by date; the mirror returns the n newest matches — same set when a tag has ≤ n stories.
 */
export async function loadMirrorTagDocs(
  variants: readonly string[],
  limit: number,
  fields: readonly string[]
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const tags = variants.filter((t) => typeof t === 'string' && t.trim() !== '').slice(0, 30)
  if (tags.length === 0) return []
  const arr = sql`ARRAY[${sql.join(tags.map((t) => sql`${t}`), sql`, `)}]::text[]`
  const res = await getDb().execute(sql`
    select id, ${pickFields(fields)} as data
    from news_read_mirror
    where status = 'published'
      and tags && ${arr}
    order by published_at desc nulls last, id desc
    limit ${clampLimit(limit)}
  `)
  return rowsOf(res).map((r) => ({ id: String(r.id), data: (r.data ?? {}) as Record<string, unknown> }))
}

/**
 * Author page list (replaces `status == published AND authorId == id ORDER BY publishedAt DESC
 * LIMIT n`). Firestore's orderBy drops docs without publishedAt, so the mirror does too.
 */
export async function loadMirrorAuthorDocs(
  authorId: string,
  limit: number,
  fields: readonly string[]
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const id = authorId.trim()
  if (!id) return []
  const res = await getDb().execute(sql`
    select id, ${pickFields(fields)} as data
    from news_read_mirror
    where status = 'published'
      and author_id = ${id}
      and published_at is not null
    order by published_at desc, id desc
    limit ${clampLimit(limit)}
  `)
  return rowsOf(res).map((r) => ({ id: String(r.id), data: (r.data ?? {}) as Record<string, unknown> }))
}
