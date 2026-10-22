import 'server-only'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { Collections } from '@/lib/firebase/collections'
import { getNewsSitemapEntries } from '@/lib/sitemap/newsSitemapLoader'
import { buildNewsIndexNowUrl, submitIndexNowUrls } from '@/lib/indexNow'
import type { NewsSitemapEntry } from '@/lib/sitemap/newsSitemap'

/**
 * SEO-15 / INDEXNOW-1: tell Bing, Yandex (and IndexNow partners) about every new
 * indexable story. Only the manual admin publish paths pinged before; the AI
 * pipeline — most of the volume — never did. Source = the cached news-sitemap
 * window, which already excludes noindex / AI-gated stories, so we never push
 * thin pages. A Firestore cursor (siteSettings/indexNowCursor) keeps each URL
 * to one submission. Runs after the crawler tick (every 30 min).
 */
export const INDEXNOW_CURSOR_DOC = 'indexNowCursor'
export const INDEXNOW_MAX_PER_RUN = 500
/** First run (no cursor): only the last few hours, not the whole 48 h window. */
export const INDEXNOW_FIRST_RUN_LOOKBACK_MS = 6 * 3600_000

export function pickIndexNowBatch(
  entries: NewsSitemapEntry[],
  cursorMs: number | null,
  now: number,
): { slugs: string[]; nextCursorMs: number | null } {
  const floor = cursorMs ?? now - INDEXNOW_FIRST_RUN_LOOKBACK_MS
  const fresh = entries
    .filter((e) => e.slug && e.publishedMs > floor && e.publishedMs <= now + 60_000)
    .sort((a, b) => a.publishedMs - b.publishedMs)
    .slice(0, INDEXNOW_MAX_PER_RUN)
  if (fresh.length === 0) return { slugs: [], nextCursorMs: cursorMs }
  return { slugs: fresh.map((e) => e.slug), nextCursorMs: fresh[fresh.length - 1].publishedMs }
}

export function isIndexNowBatchEnabled(): boolean {
  if (process.env.INDEXNOW_BATCH === 'off') return false
  return process.env.VERCEL_ENV === 'production'
}

export async function submitFreshNewsToIndexNow(now = Date.now()): Promise<{ submitted: number; skipped?: string }> {
  if (!isIndexNowBatchEnabled()) return { submitted: 0, skipped: 'disabled' }
  const ref = getAdminFirestore().collection(Collections.SITE_SETTINGS).doc(INDEXNOW_CURSOR_DOC)
  const snap = await ref.get()
  const cursorMs = typeof snap.data()?.lastPublishedMs === 'number' ? (snap.data()!.lastPublishedMs as number) : null
  const entries = await getNewsSitemapEntries()
  const { slugs, nextCursorMs } = pickIndexNowBatch(entries, cursorMs, now)
  if (slugs.length === 0) return { submitted: 0 }
  await submitIndexNowUrls(slugs.map(buildNewsIndexNowUrl))
  await ref.set({ lastPublishedMs: nextCursorMs, lastRunAt: now, lastCount: slugs.length }, { merge: true })
  console.info(`[indexnow-batch] submitted=${slugs.length}`)
  return { submitted: slugs.length }
}
