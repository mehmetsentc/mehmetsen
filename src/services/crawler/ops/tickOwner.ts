import { sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'

/**
 * FinOps (15 Nov 2026): which runtime runs the 30-minute crawler tick.
 *
 * Stored in Neon (`news_read_mirror_state`, key `crawler_tick_owner`) so it can be
 * switched with one SQL statement and no redeploy:
 *   'vercel'  (default, also when the row is missing or unreadable) — the Vercel cron runs it
 *   'railway' — the Railway worker (scripts/worker/crawler-tick.ts) runs it; Vercel skips
 *
 * Rollback: update news_read_mirror_state set value = 'vercel' where key = 'crawler_tick_owner';
 */
export type CrawlerTickOwner = 'vercel' | 'railway'

export const CRAWLER_TICK_OWNER_KEY = 'crawler_tick_owner'

export function parseCrawlerTickOwner(value: unknown): CrawlerTickOwner {
  return typeof value === 'string' && value.trim().toLowerCase() === 'railway' ? 'railway' : 'vercel'
}

export async function readCrawlerTickOwner(): Promise<CrawlerTickOwner> {
  if (!hasDatabaseUrl()) return 'vercel'
  try {
    const res = (await getDb().execute(
      sql`select value from news_read_mirror_state where key = ${CRAWLER_TICK_OWNER_KEY}`
    )) as unknown as { rows?: { value: string }[] } | { value: string }[]
    const rows = Array.isArray(res) ? res : res.rows
    return parseCrawlerTickOwner(rows?.[0]?.value)
  } catch (error) {
    console.warn('[crawler] tick owner read failed, defaulting to vercel', error instanceof Error ? error.message : error)
    return 'vercel'
  }
}
