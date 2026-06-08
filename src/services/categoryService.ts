import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  orderBy,
  query,
} from 'firebase/firestore'
import { DEFAULT_CATEGORIES } from '@/constants/config'
import { db, Collections } from '@/lib/firebase/firestore'
import { enqueueFirestoreRead } from '@/lib/firestoreQueue'
import type { Category } from '@/types/common'

function normalizeCategory(id: string, data: Record<string, unknown>): Category {
  const now = new Date().toISOString()
  return {
    id,
    name: (data.name as string) ?? id,
    slug: (data.slug as string) ?? id,
    description: (data.description as string) ?? '',
    iconName: (data.iconName as string) ?? 'hash',
    color: (data.color as string) ?? '#6B7280',
    order: Number(data.order ?? 0),
    isActive: data.isActive !== false,
    postsCount: Number(data.postsCount ?? 0),
    createdAt: (data.createdAt as string) ?? now,
  }
}

function defaultToCategory(
  cat: (typeof DEFAULT_CATEGORIES)[number],
  order: number
): Category {
  return {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    description: '',
    iconName: cat.iconName,
    color: cat.color,
    order,
    isActive: true,
    postsCount: 0,
    createdAt: new Date().toISOString(),
  }
}

export const categoryService = {
  async list(): Promise<Category[]> {
    try {
      const snap = await enqueueFirestoreRead(() =>
        getDocs(query(collection(db, Collections.CATEGORIES), orderBy('order', 'asc')))
      )
      if (snap.empty) {
        return DEFAULT_CATEGORIES.map((c, i) => defaultToCategory(c, i))
      }
      return snap.docs.map((d) => normalizeCategory(d.id, d.data() as Record<string, unknown>))
    } catch {
      return DEFAULT_CATEGORIES.map((c, i) => defaultToCategory(c, i))
    }
  },

  async create(data: {
    id: string
    name: string
    slug: string
    order?: number
    iconName?: string
    color?: string
  }): Promise<void> {
    const now = new Date().toISOString()
    await setDoc(doc(db, Collections.CATEGORIES, data.id), {
      name: data.name.trim(),
      slug: data.slug.trim(),
      description: '',
      iconName: data.iconName ?? 'hash',
      color: data.color ?? '#6B7280',
      order: data.order ?? 0,
      isActive: true,
      postsCount: 0,
      createdAt: now,
    })
  },

  async update(
    id: string,
    data: Partial<Pick<Category, 'name' | 'slug' | 'order' | 'iconName' | 'color' | 'isActive'>>
  ): Promise<void> {
    await updateDoc(doc(db, Collections.CATEGORIES, id), data)
  },

  async remove(id: string): Promise<void> {
    await deleteDoc(doc(db, Collections.CATEGORIES, id))
  },
}
