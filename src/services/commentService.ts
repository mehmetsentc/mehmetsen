import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  increment,
  query,
  where,
  orderBy,
  limit,
} from 'firebase/firestore'
import { db, Collections, VIDEO_FEED_COLLECTION } from '@/lib/firebase/firestore'
import { notificationService } from '@/services/notificationService'
import { userService } from '@/services/userService'
import type { Comment } from '@/types/comment'

const PAGE_SIZE = 30
// Matches @username tokens (letters, digits, underscore) for mention parsing.
const MENTION_REGEX = /@([a-z0-9_]+)/gi

/**
 * Increments the comment counter on the underlying content doc and returns the
 * content author's id so the caller can notify them. Returns null when the
 * content can't be located.
 */
async function incrementCommentCount(postId: string, delta: number): Promise<string | null> {
  const newsRef = doc(db, VIDEO_FEED_COLLECTION, postId)
  const newsSnap = await getDoc(newsRef)
  if (newsSnap.exists()) {
    await updateDoc(newsRef, { commentCount: increment(delta) })
    return (newsSnap.data().authorId as string | undefined) ?? null
  }

  const postsRef = doc(db, Collections.POSTS, postId)
  const postsSnap = await getDoc(postsRef)
  if (postsSnap.exists()) {
    await updateDoc(postsRef, { commentsCount: increment(delta) })
    return (postsSnap.data().authorId as string | undefined) ?? null
  }

  return null
}

/** Extracts unique, lower-cased @usernames from comment text. */
function extractMentions(text: string): string[] {
  const found = new Set<string>()
  for (const match of text.matchAll(MENTION_REGEX)) {
    const handle = match[1]?.toLowerCase()
    if (handle) found.add(handle)
  }
  return [...found]
}

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

    const authorId = await incrementCommentCount(data.postId, 1)

    // Notifications are best-effort and must never break commenting.
    try {
      const snippet = data.content.slice(0, 140)
      const notifiedIds = new Set<string>([data.authorId])

      // Notify the content author about the new comment.
      if (authorId && !notifiedIds.has(authorId)) {
        notifiedIds.add(authorId)
        await notificationService.createNotification({
          userId: authorId,
          type: 'comment',
          actorId: data.authorId,
          actorUsername: data.authorUsername,
          actorPhotoURL: data.authorPhotoURL,
          postId: data.postId,
          commentId: ref.id,
          text: snippet,
        })
      }

      // Notify any @mentioned users that haven't already been notified.
      const mentions = extractMentions(data.content)
      for (const handle of mentions) {
        const mentioned = await userService.getByUsername(handle)
        if (!mentioned || notifiedIds.has(mentioned.uid)) continue
        notifiedIds.add(mentioned.uid)
        await notificationService.createNotification({
          userId: mentioned.uid,
          type: 'mention',
          actorId: data.authorId,
          actorUsername: data.authorUsername,
          actorPhotoURL: data.authorPhotoURL,
          postId: data.postId,
          commentId: ref.id,
          text: snippet,
        })
      }
    } catch (error) {
      console.warn('[commentService] notification dispatch failed:', error)
    }

    return ref.id
  },
}
