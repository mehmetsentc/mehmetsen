import { sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'

/**
 * FinOps (25 Nov 2026): which runtime runs the heavy reel / video render jobs.
 *
 * Stored in Neon (`news_read_mirror_state`, key `reel_jobs_owner`) so it switches with
 * one SQL statement, no redeploy:
 *   'vercel'  (default, also when the row is missing or unreadable) — jobs run in the
 *             Vercel function that started them (`after()`), exactly as before
 *   'railway' — jobs are queued in Firestore and the Railway reel worker runs them; if no
 *             worker picks a job up in time, Vercel runs it itself (see reelJobs.ts)
 *
 * Switch:   update news_read_mirror_state set value = 'railway', updated_at = now() where key = 'reel_jobs_owner';
 * Rollback: update news_read_mirror_state set value = 'vercel',  updated_at = now() where key = 'reel_jobs_owner';
 */
export type ReelJobsOwner = 'vercel' | 'railway'

export const REEL_JOBS_OWNER_KEY = 'reel_jobs_owner'
const CACHE_MS = 30_000

let cached: { at: number; value: ReelJobsOwner } | null = null

export function parseReelJobsOwner(value: unknown): ReelJobsOwner {
  return typeof value === 'string' && value.trim().toLowerCase() === 'railway' ? 'railway' : 'vercel'
}

export function __resetReelJobsOwnerCacheForTests(): void {
  cached = null
}

export async function readReelJobsOwner(now = Date.now()): Promise<ReelJobsOwner> {
  if (cached && now - cached.at < CACHE_MS) return cached.value
  let value: ReelJobsOwner = 'vercel'
  if (hasDatabaseUrl()) {
    try {
      const res = (await getDb().execute(
        sql`select value from news_read_mirror_state where key = ${REEL_JOBS_OWNER_KEY}`
      )) as unknown as { rows?: { value: string }[] } | { value: string }[]
      const rows = Array.isArray(res) ? res : res.rows
      value = parseReelJobsOwner(rows?.[0]?.value)
    } catch (error) {
      console.warn('[reels] job owner read failed, defaulting to vercel', error instanceof Error ? error.message : error)
      value = 'vercel'
    }
  }
  cached = { at: now, value }
  return value
}
