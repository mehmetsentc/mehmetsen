import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
} from 'firebase/firestore'
import { db, Collections, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { generateSaveId } from '@/lib/utils'
import { postService } from '@/services/postService'
import type { Post } from '@/types/post'

export const saveService = {
  async isSaved(userId: string, postId: string): Promise<boolean> {
    try {
      const snap = await getDoc(doc(db, Collections.SAVES, generateSaveId(userId, postId)))
      return snap.exists()
    } catch {
      return false
    }
  },

  async save(userId: string, postId: string): Promise<void> {
    const saveId = generateSaveId(userId, postId)
    const saveRef = doc(db, Collections.SAVES, saveId)

    await runTransaction(db, async (transaction) => {
      const saveSnap = await transaction.get(saveRef)
      if (saveSnap.exists()) return

      const newsRef = doc(db, VIDEO_FEED_COLLECTION, postId)
      const newsSnap = await transaction.get(newsRef)
      const contentRef = newsSnap.exists()
        ? newsRef
        : doc(db, Collections.POSTS, postId)
      const contentSnap = newsSnap.exists() ? newsSnap : await transaction.get(contentRef)

      if (!contentSnap.exists()) {
        throw new Error('İçerik bulunamadı')
      }

      transaction.set(saveRef, {
        userId,
        postId,
        createdAt: new Date().toISOString(),
      })
      transaction.update(contentRef, { savesCount: increment(1) })
    })
  },

  async unsave(userId: string, postId: string): Promise<void> {
    const saveId = generateSaveId(userId, postId)
    const saveRef = doc(db, Collections.SAVES, saveId)

    await runTransaction(db, async (transaction) => {
      const saveSnap = await transaction.get(saveRef)
      if (!saveSnap.exists()) return

      const newsRef = doc(db, VIDEO_FEED_COLLECTION, postId)
      const newsSnap = await transaction.get(newsRef)
      const contentRef = newsSnap.exists()
        ? newsRef
        : doc(db, Collections.POSTS, postId)
      const contentSnap = newsSnap.exists() ? newsSnap : await transaction.get(contentRef)

      transaction.delete(saveRef)

      if (contentSnap.exists()) {
        const current = (contentSnap.data().savesCount as number | undefined) ?? 0
        if (current > 0) {
          transaction.update(contentRef, { savesCount: increment(-1) })
        }
      }
    })
  },

  async toggle(userId: string, postId: string, currentlySaved: boolean): Promise<boolean> {
    if (currentlySaved) {
      await this.unsave(userId, postId)
      return false
    }
    await this.save(userId, postId)
    return true
  },

  async getSavedPostIds(userId: string, max = 30): Promise<string[]> {
    const snap = await getDocs(
      query(
        collection(db, Collections.SAVES),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(max)
      )
    )
    return snap.docs.map((d) => d.data().postId as string).filter(Boolean)
  },

  /**
   * Resolves a user's saved records into renderable Post objects. Saves can
   * target either the `news` collection (primary content) or the legacy
   * `posts` collection, so each id is hydrated from `news` first with a
   * `posts` fallback. Order follows the saved-at-desc order of the ids.
   */
  async getSavedPosts(userId: string, max = 30): Promise<Post[]> {
    const ids = await this.getSavedPostIds(userId, max)
    if (ids.length === 0) return []

    const resolved = await Promise.all(
      ids.map(async (id) => {
        const news = await postService.getNewsById(id)
        if (news) return news
        return postService.getById(id)
      })
    )

    return resolved.filter((post): post is Post => post !== null)
  },

  async getSavedStatus(userId: string, postIds: string[]): Promise<Record<string, boolean>> {
    const entries = await Promise.all(
      postIds.map(async (postId) => {
        const saved = await this.isSaved(userId, postId)
        return [postId, saved] as const
      })
    )
    return Object.fromEntries(entries)
  },
}
