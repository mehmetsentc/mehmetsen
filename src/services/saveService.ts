import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
} from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { generateSaveId } from '@/lib/utils'

export const saveService = {
  async isSaved(userId: string, postId: string): Promise<boolean> {
    const snap = await getDoc(doc(db, Collections.SAVES, generateSaveId(userId, postId)))
    return snap.exists()
  },

  async save(userId: string, postId: string): Promise<void> {
    const saveId = generateSaveId(userId, postId)
    await setDoc(doc(db, Collections.SAVES, saveId), {
      userId,
      postId,
      createdAt: new Date().toISOString(),
    })
    await updateDoc(doc(db, Collections.POSTS, postId), {
      savesCount: increment(1),
    })
  },

  async unsave(userId: string, postId: string): Promise<void> {
    const saveId = generateSaveId(userId, postId)
    await deleteDoc(doc(db, Collections.SAVES, saveId))
    await updateDoc(doc(db, Collections.POSTS, postId), {
      savesCount: increment(-1),
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
