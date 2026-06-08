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
import { generateLikeId } from '@/lib/utils'
import { notificationService } from '@/services/notificationService'

export const likeService = {
  async isLiked(userId: string, postId: string): Promise<boolean> {
    try {
      const snap = await getDoc(doc(db, Collections.LIKES, generateLikeId(userId, postId)))
      return snap.exists()
    } catch {
      return false
    }
  },

  async like(userId: string, postId: string): Promise<void> {
    const likeId = generateLikeId(userId, postId)
    const likeRef = doc(db, Collections.LIKES, likeId)

    let authorId: string | undefined
    let alreadyLiked = false

    await runTransaction(db, async (transaction) => {
      const likeSnap = await transaction.get(likeRef)
      if (likeSnap.exists()) {
        alreadyLiked = true
        return
      }

      const newsRef = doc(db, VIDEO_FEED_COLLECTION, postId)
      const newsSnap = await transaction.get(newsRef)
      const contentRef = newsSnap.exists()
        ? newsRef
        : doc(db, Collections.POSTS, postId)
      const contentSnap = newsSnap.exists() ? newsSnap : await transaction.get(contentRef)

      if (!contentSnap.exists()) {
        throw new Error('İçerik bulunamadı')
      }

      authorId = contentSnap.data().authorId as string | undefined

      transaction.set(likeRef, {
        userId,
        postId,
        type: 'post',
        createdAt: new Date().toISOString(),
      })
      transaction.update(contentRef, { likesCount: increment(1) })
    })

    // Fire-and-forget: notify the post author (guarded — never breaks the like).
    if (!alreadyLiked && authorId && authorId !== userId) {
      try {
        await notificationService.createNotification({
          userId: authorId,
          type: 'like',
          actorId: userId,
          postId,
        })
      } catch {
        // Notification failures are non-fatal.
      }
    }
  },

  async unlike(userId: string, postId: string): Promise<void> {
    const likeId = generateLikeId(userId, postId)
    const likeRef = doc(db, Collections.LIKES, likeId)

    await runTransaction(db, async (transaction) => {
      const likeSnap = await transaction.get(likeRef)
      if (!likeSnap.exists()) return

      const newsRef = doc(db, VIDEO_FEED_COLLECTION, postId)
      const newsSnap = await transaction.get(newsRef)
      const contentRef = newsSnap.exists()
        ? newsRef
        : doc(db, Collections.POSTS, postId)
      const contentSnap = newsSnap.exists() ? newsSnap : await transaction.get(contentRef)

      transaction.delete(likeRef)

      if (contentSnap.exists()) {
        const current = (contentSnap.data().likesCount as number | undefined) ?? 0
        if (current > 0) {
          transaction.update(contentRef, { likesCount: increment(-1) })
        }
      }
    })
  },

  async toggle(userId: string, postId: string): Promise<boolean> {
    const likeId = generateLikeId(userId, postId)
    const likeRef = doc(db, Collections.LIKES, likeId)
    let authorId: string | undefined
    let newLiked = false
    let shouldNotify = false

    await runTransaction(db, async (transaction) => {
      const likeSnap = await transaction.get(likeRef)

      const newsRef = doc(db, VIDEO_FEED_COLLECTION, postId)
      const newsSnap = await transaction.get(newsRef)
      const contentRef = newsSnap.exists()
        ? newsRef
        : doc(db, Collections.POSTS, postId)
      const contentSnap = newsSnap.exists() ? newsSnap : await transaction.get(contentRef)

      if (likeSnap.exists()) {
        transaction.delete(likeRef)
        if (contentSnap.exists()) {
          const current = (contentSnap.data().likesCount as number | undefined) ?? 0
          if (current > 0) {
            transaction.update(contentRef, { likesCount: increment(-1) })
          }
        }
        newLiked = false
        return
      }

      if (!contentSnap.exists()) {
        throw new Error('İçerik bulunamadı')
      }

      authorId = contentSnap.data().authorId as string | undefined
      transaction.set(likeRef, {
        userId,
        postId,
        type: 'post',
        createdAt: new Date().toISOString(),
      })
      transaction.update(contentRef, { likesCount: increment(1) })
      newLiked = true
      shouldNotify = true
    })

    if (shouldNotify && authorId && authorId !== userId) {
      try {
        await notificationService.createNotification({
          userId: authorId,
          type: 'like',
          actorId: userId,
          postId,
        })
      } catch {
        // Notification failures are non-fatal.
      }
    }

    return newLiked
  },

  async getLikedPostIds(userId: string, max = 30): Promise<string[]> {
    const snap = await getDocs(
      query(
        collection(db, Collections.LIKES),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(max)
      )
    )
    return snap.docs.map((d) => d.data().postId as string).filter(Boolean)
  },

  async getLikedStatus(userId: string, postIds: string[]): Promise<Record<string, boolean>> {
    const entries = await Promise.all(
      postIds.map(async (postId) => {
        const liked = await this.isLiked(userId, postId)
        return [postId, liked] as const
      })
    )
    return Object.fromEntries(entries)
  },
}
