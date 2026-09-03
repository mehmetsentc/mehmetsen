import 'server-only'

import { and, desc, inArray, sql } from 'drizzle-orm'
import { getDb, hasDatabaseUrl } from '@/db'
import { news } from '@/db/schema/news'
import { DEFAULT_CATEGORIES, TOP_NAV_CATEGORY_IDS, getSubcategories } from '@/constants/config'

const TRACKED = new Set<string>(['son-dakika', 'yerel-haber', ...TOP_NAV_CATEGORY_IDS])

function parentBucket(categoryId: string | null | undefined): string | null {
  if (!categoryId) return null
  const cat = DEFAULT_CATEGORIES.find((c) => c.id === categoryId)
  if (!cat) return categoryId
  if (TRACKED.has(cat.id)) {
    return cat.id === 'yerel-haber' ? 'yerel' : cat.id
  }
  if (cat.parentId && TRACKED.has(cat.parentId)) {
    return cat.parentId === 'yerel-haber' ? 'yerel' : cat.parentId
  }
  return null
}

/** All category ids that roll up into tracked feed-v2 tabs. */
function trackedLeafIds(): string[] {
  const ids = new Set<string>()
  for (const id of TRACKED) {
    if (id === 'yerel') continue
    ids.add(id === 'yerel-haber' ? 'yerel-haber' : id)
    for (const kid of getSubcategories(id === 'yerel' ? 'yerel-haber' : id)) {
      ids.add(kid.id)
    }
  }
  ids.add('yerel-haber')
  return Array.from(ids)
}

/**
 * Return tracked category/tab ids ordered by most recent published article
 * in that bucket (freshest first).
 */
export async function getCategoryFreshnessOrder(): Promise<string[]> {
  if (!hasDatabaseUrl()) {
    return ['son-dakika', 'yerel', ...TOP_NAV_CATEGORY_IDS]
  }

  try {
    const db = getDb()
    const leafIds = trackedLeafIds()
    const rows = await db
      .select({
        categoryId: news.categoryId,
        lastAt: sql<Date>`max(${news.publishedAt})`.mapWith((v) =>
          v instanceof Date ? v : new Date(String(v))
        ),
      })
      .from(news)
      .where(
        and(
          inArray(news.status, ['published']),
          inArray(news.categoryId, leafIds)
        )
      )
      .groupBy(news.categoryId)
      .orderBy(desc(sql`max(${news.publishedAt})`))

    const best = new Map<string, number>()
    for (const row of rows) {
      const bucket = parentBucket(row.categoryId)
      if (!bucket) continue
      const t = row.lastAt?.getTime?.() ?? 0
      const prev = best.get(bucket) ?? 0
      if (t > prev) best.set(bucket, t)
    }

    return Array.from(best.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id)
  } catch {
    return ['son-dakika', 'yerel', ...TOP_NAV_CATEGORY_IDS]
  }
}
