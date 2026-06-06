import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
} from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { generateLikeId } from '@/lib/utils'

export const likeService = {
  async isLiked(userId: string, postId: string): Promise<boolean> {
    const snap = await getDoc(doc(db, Collections.LIKES, generateLikeId(userId, postId)))
    return snap.exists()
  },

  async like(userId: string, postId: string): Promise<void> {
    const likeId = generateLikeId(userId, postId)
    await setDoc(doc(db, Collections.LIKES, likeId), {
      userId,
      postId,
      type: 'post',
      createdAt: new Date().toISOString(),
    })
    await updateDoc(doc(db, Collections.POSTS, postId), {
      likesCount: increment(1),
    })
  },

  async unlike(userId: string, postId: string): Promise<void> {
    const likeId = generateLikeId(userId, postId)
    await deleteDoc(doc(db, Collections.LIKES, likeId))
    await updateDoc(doc(db, Collections.POSTS, postId), {
      likesCount: increment(-1),
    })
  },

  async toggle(userId: string, postId: string, currentlyLiked: boolean): Promise<boolean> {
    if (currentlyLiked) {
      await this.unlike(userId, postId)
      return false
    }
    await this.like(userId, postId)
    return true
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
