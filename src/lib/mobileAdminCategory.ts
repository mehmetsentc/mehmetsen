import { auth } from '@/lib/firebase/auth'
import {
  composeYerelCategoryId,
  getAdminCategoryGroups,
  getYerelSubcategories,
  getYerelSubcategoryShortLabel,
  isYerelCategoryTree,
  resolveYerelCategoryParts,
  YEREL_HABER_CATEGORY_ID,
} from '@/constants/config'
import { getCategoryLabel } from '@/lib/newsMapper'

export async function updateNewsCategory(postId: string, categoryId: string): Promise<void> {
  const token = (await auth.currentUser?.getIdToken()) ?? ''
  const res = await fetch(`/api/admin/news/${postId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      categoryId,
      isBreaking: categoryId === 'son-dakika',
    }),
  })
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string }
    throw new Error(err.error ?? 'Kategori güncellenemedi')
  }
}

export function getMobileCategoryLabel(categoryId: string): string {
  if (!categoryId) return 'Kategori'
  if (isYerelCategoryTree(categoryId)) {
    const parts = resolveYerelCategoryParts(categoryId)
    if (parts.subcategoryId) {
      const sub = getYerelSubcategories().find((c) => c.id === parts.subcategoryId)
      return sub ? `Yerel · ${getYerelSubcategoryShortLabel(sub)}` : 'Yerel Haber'
    }
    return 'Yerel Haber'
  }
  return getCategoryLabel(categoryId) || categoryId
}

export {
  composeYerelCategoryId,
  getAdminCategoryGroups,
  getYerelSubcategories,
  getYerelSubcategoryShortLabel,
  isYerelCategoryTree,
  resolveYerelCategoryParts,
  YEREL_HABER_CATEGORY_ID,
}
