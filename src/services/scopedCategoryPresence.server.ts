import { unstable_cache } from 'next/cache'
import { getSubcategories } from '@/constants/config'
import { getAdminFirestore } from '@/lib/firebase/admin'
import { NEWS_COLLECTION } from '@/lib/newsQueries'
import { shouldHideEmptyScopedCategories } from '@/lib/scopedCategoryPresence'

function treeCategoryIds(parentId: string): string[] {
  return [parentId, ...getSubcategories(parentId).map((c) => c.id)]
}

async function probePublishedCategoryIds(ids: string[]): Promise<Set<string>> {
  const active = new Set<string>()
  if (ids.length === 0) return active

  const db = getAdminFirestore()
  const col = db.collection(NEWS_COLLECTION)

  const found = await Promise.all(
    ids.map(async (id) => {
      try {
        const snap = await col
          .where('status', '==', 'published')
          .where('categoryId', '==', id)
          .limit(1)
          .get()
        return snap.empty ? null : id
      } catch {
        return null
      }
    })
  )

  for (const id of found) {
    if (id) active.add(id)
  }
  return active
}

async function addBreakingOriginalCategoryIds(
  treeIds: Set<string>,
  active: Set<string>
): Promise<void> {
  try {
    const db = getAdminFirestore()
    const snap = await db
      .collection(NEWS_COLLECTION)
      .where('status', '==', 'published')
      .where('isBreaking', '==', true)
      .orderBy('publishedAt', 'desc')
      .limit(80)
      .get()

    for (const doc of snap.docs) {
      const data = doc.data() as { categoryId?: string; originalCategoryId?: string }
      const cat = String(data.categoryId ?? '').trim()
      const original = String(data.originalCategoryId ?? '').trim()
      if (treeIds.has(cat)) active.add(cat)
      if (treeIds.has(original)) active.add(original)
    }
  } catch {
    /* index / quota — direct categoryId probes still apply */
  }
}

async function fetchActiveScopedCategoryIds(parentId: string): Promise<string[]> {
  const ids = treeCategoryIds(parentId)
  const active = await probePublishedCategoryIds(ids)
  await addBreakingOriginalCategoryIds(new Set(ids), active)
  return ids.filter((id) => active.has(id))
}

const getActiveScopedCategoryIdsCached = unstable_cache(
  fetchActiveScopedCategoryIds,
  ['scoped-category-presence-v1'],
  { revalidate: 300, tags: ['category-presence', 'category-feed'] }
)

/** Published category ids in a yerel/kıbrıs tree (parent + subs). */
export async function getActiveScopedCategoryIds(parentId: string): Promise<string[]> {
  if (!shouldHideEmptyScopedCategories(parentId)) {
    return treeCategoryIds(parentId)
  }
  return getActiveScopedCategoryIdsCached(parentId)
}
