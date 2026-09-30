import { isCityLocalArticle } from '@/lib/feed/personalLocalScope'

/** Home-city local stays a seasoning. Older local must not fill Sana Özel. */
export const PERSONAL_LOCAL_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000
/** At most one fresh local card per this many national cards. */
export const PERSONAL_LOCAL_STRIDE = 5

export function feedCategoryFamily(category: string | null | undefined): string {
  const cat = (category ?? '_general').trim().toLowerCase()
  if (cat === 'yerel' || cat.startsWith('yerel-')) return 'yerel'
  return cat || '_general'
}

type InventoryRow = {
  publishedAt: Date
  citySlug?: string | null
  category?: string | null
  source?: string | null
  candidateSources?: readonly string[] | null
}

/**
 * Sana Özel inventory: unseen national stays, newest first.
 * Local the reader already scrolled (older than three days) is dropped.
 * A few fresh local cards remain so the home city is still present.
 * Like / read / dwell scoring still runs on what this returns.
 */
export function shapePersonalInventory<T extends InventoryRow>(rows: T[], nowMs: number): T[] {
  const national: T[] = []
  const freshLocal: T[] = []
  for (const row of rows) {
    if (!isCityLocalArticle(row)) {
      national.push(row)
      continue
    }
    if (nowMs - row.publishedAt.getTime() <= PERSONAL_LOCAL_MAX_AGE_MS) freshLocal.push(row)
  }
  national.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  freshLocal.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  const budget =
    national.length === 0 ? freshLocal.length : Math.floor(national.length / (PERSONAL_LOCAL_STRIDE - 1))
  return [...national, ...freshLocal.slice(0, Math.max(0, budget))]
}
