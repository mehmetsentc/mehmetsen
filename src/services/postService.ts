import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  increment,
  type QueryDocumentSnapshot,
} from 'firebase/firestore'
import { db, Collections } from '@/lib/firebase/firestore'
import { hasVideoContent } from '@/lib/postUtils'
import type { Post } from '@/types/post'

const PAGE_SIZE = 10

function toPost(d: QueryDocumentSnapshot): Post {
  return { id: d.id, ...d.data() } as Post
}

export const postService = {
  async getFeed(lastDoc?: QueryDocumentSnapshot) {
    const constraints: Parameters<typeof query>[1][] = [
      where('status', '==', 'published'),
      where('visibility', '==', 'public'),
      orderBy('publishedAt', 'desc'),
      limit(PAGE_SIZE),
    ]
    if (lastDoc) constraints.push(startAfter(lastDoc))

    const snap = await getDocs(query(collection(db, Collections.POSTS), ...constraints))
    return {
      posts: snap.docs.map(toPost),
      lastDoc: snap.docs[snap.docs.length - 1] ?? null,
      hasMore: snap.docs.length === PAGE_SIZE,
    }
  },

  async getByCategory(categoryId: string, lastDoc?: QueryDocumentSnapshot) {
    const constraints: Parameters<typeof query>[1][] = [
      where('status', '==', 'published'),
      where('visibility', '==', 'public'),
      where('categoryId', '==', categoryId),
      orderBy('publishedAt', 'desc'),
      limit(PAGE_SIZE),
    ]
    if (lastDoc) constraints.push(startAfter(lastDoc))

    const snap = await getDocs(query(collection(db, Collections.POSTS), ...constraints))
    return {
      posts: snap.docs.map(toPost),
      lastDoc: snap.docs[snap.docs.length - 1] ?? null,
      hasMore: snap.docs.length === PAGE_SIZE,
    }
  },

  async getByAuthor(authorId: string, lastDoc?: QueryDocumentSnapshot) {
    const constraints: Parameters<typeof query>[1][] = [
      where('authorId', '==', authorId),
      orderBy('createdAt', 'desc'),
      limit(PAGE_SIZE),
    ]
    if (lastDoc) constraints.push(startAfter(lastDoc))

    const snap = await getDocs(query(collection(db, Collections.POSTS), ...constraints))
    return {
      posts: snap.docs.map(toPost),
      lastDoc: snap.docs[snap.docs.length - 1] ?? null,
      hasMore: snap.docs.length === PAGE_SIZE,
    }
  },

  async getById(id: string): Promise<Post | null> {
    const snap = await getDoc(doc(db, Collections.POSTS, id))
    if (!snap.exists()) return null
    return { id: snap.id, ...snap.data() } as Post
  },

  async create(
    data: Omit<Post, 'id' | 'createdAt' | 'updatedAt' | 'likesCount' | 'commentsCount' | 'savesCount' | 'viewsCount'>
  ): Promise<string> {
    const now = new Date().toISOString()
    const ref = await addDoc(collection(db, Collections.POSTS), {
      ...data,
      likesCount: 0,
      commentsCount: 0,
      savesCount: 0,
      viewsCount: 0,
      publishedAt: data.status === 'published' ? now : null,
      createdAt: now,
      updatedAt: now,
    })
    return ref.id
  },

  async update(id: string, data: Partial<Post>) {
    await updateDoc(doc(db, Collections.POSTS, id), {
      ...data,
      updatedAt: new Date().toISOString(),
    })
  },

  async delete(id: string) {
    await deleteDoc(doc(db, Collections.POSTS, id))
  },

  async getVideoFeed(lastDoc?: QueryDocumentSnapshot) {
    try {
      const constraints: Parameters<typeof query>[1][] = [
        where('status', '==', 'published'),
        where('visibility', '==', 'public'),
        where('hasVideo', '==', true),
        orderBy('publishedAt', 'desc'),
        limit(PAGE_SIZE),
      ]
      if (lastDoc) constraints.push(startAfter(lastDoc))

      const snap = await getDocs(query(collection(db, Collections.POSTS), ...constraints))
      return {
        posts: snap.docs.map(toPost),
        lastDoc: snap.docs[snap.docs.length - 1] ?? null,
        hasMore: snap.docs.length === PAGE_SIZE,
      }
    } catch {
      const result = await this.getFeed(lastDoc)
      const videoPosts = result.posts.filter(hasVideoContent)
      return {
        posts: videoPosts,
        lastDoc: result.lastDoc,
        hasMore: result.hasMore,
      }
    }
  },

  async incrementViews(id: string) {
    await updateDoc(doc(db, Collections.POSTS, id), {
      viewsCount: increment(1),
    })
  },
}
