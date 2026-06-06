import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  increment,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import type { Comment } from '@/types/comment'

const PAGE_SIZE = 30

export const commentService = {
  async getByPost(postId: string): Promise<Comment[]> {
    const snap = await getDocs(
      query(
        collection(db, Collections.COMMENTS),
        where('postId', '==', postId),
        orderBy('createdAt', 'desc'),
        limit(PAGE_SIZE)
      )
    )
    return snap.docs
      .map((d) => ({ id: d.id, ...d.data() }) as Comment)
      .filter((c) => !c.isDeleted)
  },

  async create(data: {
    postId: string
    content: string
    authorId: string
    authorUsername: string
    authorPhotoURL: string | null
  }): Promise<string> {
    const now = new Date().toISOString()
    const ref = await addDoc(collection(db, Collections.COMMENTS), {
      postId: data.postId,
      parentId: null,
      authorId: data.authorId,
      authorUsername: data.authorUsername,
      authorPhotoURL: data.authorPhotoURL,
      content: data.content,
      likesCount: 0,
      repliesCount: 0,
      isEdited: false,
      isDeleted: false,
      createdAt: now,
      updatedAt: now,
    })
    await updateDoc(doc(db, Collections.POSTS, data.postId), {
      commentsCount: increment(1),
    })
    return ref.id
  },
}
